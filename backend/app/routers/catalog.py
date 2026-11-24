from decimal import Decimal
from enum import StrEnum

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, exists, false, func, select, text
from sqlalchemy.orm import Session, joinedload, selectinload

from app.availability import low_stock
from app.db import get_db
from app.deps import get_current_user_optional
from app.models import (
    Brand,
    Gender,
    Order,
    OrderItem,
    OrderStatus,
    PriceTier,
    Product,
    ProductVariant,
    Promotion,
    User,
)
from app.pricing import (
    Deal,
    deal_price,
    max_tier_for_role,
    next_role,
    price_for_tier,
    teaser_tier,
    visible_tiers,
)
from app.schemas.catalog import (
    BrandBrief,
    BrandOut,
    DealOut,
    FilterBrand,
    FiltersOut,
    PricingRulesOut,
    ProductDetail,
    ProductListItem,
    ProductPage,
    PromotionPublic,
    SitemapOut,
    SitemapProduct,
    TesterOffer,
    VariantPublic,
)
from app.schemas.categories import CategoryBrief, CategoryPublic
from app.schemas.currency import CurrencyOut
from app.services import categories, promotions, rates
from app.services.search import (
    SIMILAR,
    brand_name_match,
    product_name_match,
    product_similarity,
)
from app.services.settings import get_pricing_settings

router = APIRouter(tags=["catalog"])


class ProductSort(StrEnum):
    default = "default"
    name = "name"
    price_asc = "price_asc"
    price_desc = "price_desc"
    new = "new"
    # Most units sold lately (POPULAR_DAYS), then marked «Новинка», then the latest added.
    popular = "popular"


# «Хиты продаж» count the units sold in this many days (store sales too; cancelled orders not).
POPULAR_DAYS = 60


def variant_public(
    variant: ProductVariant,
    user: User | None,
    teaser: PriceTier | None = None,
    deal: Deal | None = None,
) -> VariantPublic:
    role = user.role if user else None
    tier = max_tier_for_role(role)
    tiers = visible_tiers(role)
    promo = deal_price(variant, tier, deal)
    price = promo if promo is not None else price_for_tier(variant, tier)
    next_price = price_for_tier(variant, teaser) if teaser else None
    if next_price is not None and next_price >= price:
        next_price = None
    return VariantPublic(
        next_tier=teaser if next_price is not None else None,
        next_tier_price=next_price,
        id=variant.id,
        volume_ml=variant.volume_ml,
        is_tester=variant.is_tester,
        sku=variant.sku,
        stock=low_stock(variant.stock),
        photo_url=variant.photo_url,
        price=price,
        price_tier=tier,
        retail_price=variant.retail_price,
        wholesale_price=(
            price_for_tier(variant, PriceTier.wholesale) if PriceTier.wholesale in tiers else None
        ),
        bulk_price=price_for_tier(variant, PriceTier.bulk) if PriceTier.bulk in tiers else None,
        deal=_deal_out(deal) if promo is not None else None,
    )


def _deal_out(deal: Deal) -> DealOut:
    return DealOut(
        promotion_id=deal.promotion_id,
        title=deal.title,
        discount_percent=deal.discount_percent,
        ends_on=deal.ends_on,
    )


def _viewer_price(variant: ProductVariant, tier: PriceTier, deal: Deal | None) -> Decimal:
    promo = deal_price(variant, tier, deal)
    return promo if promo is not None else price_for_tier(variant, tier)


def _tester_offer(
    variants: list[ProductVariant], tier: PriceTier, deal: Deal | None
) -> TesterOffer | None:
    """The tester with the biggest saving on the bottle of its volume, at this viewer's prices."""
    bottles = {v.volume_ml: v for v in variants if not v.is_tester}
    best = None
    for t in variants:
        bottle = bottles.get(t.volume_ml) if t.is_tester else None
        if bottle is None:
            continue
        price, bottle_price = _viewer_price(t, tier, deal), _viewer_price(bottle, tier, deal)
        if price < bottle_price and (best is None or bottle_price - price > best[2] - best[1]):
            best = (t.volume_ml, price, bottle_price)
    if best is None:
        return None
    return TesterOffer(volume_ml=best[0], price=best[1], bottle_price=best[2])


def _list_item_fields(
    product: Product,
    variants: list[ProductVariant],
    min_price: Decimal | None,
    user: User | None,
    deal: Deal | None,
) -> dict:
    image = product.image_url or next((v.photo_url for v in variants if v.photo_url), None)
    tier = max_tier_for_role(user.role if user else None)
    # The badge "−15%": only when the promotion lowers a price this viewer pays.
    applies = deal is not None and any(deal_price(v, tier, deal) is not None for v in variants)
    return dict(
        id=product.id,
        name=product.name,
        brand=BrandBrief.model_validate(product.brand),
        category_id=product.category_id,
        kind=categories.kind_of(product),
        type=product.type,
        category=product.category,
        gender=product.gender,
        longevity=product.longevity,
        image_url=image,
        min_price=min_price,
        volumes=sorted({v.volume_ml for v in variants}),
        is_new=product.is_new,
        deal=_deal_out(deal) if applies and deal else None,
        tester=_tester_offer(variants, tier, deal),
    )


@router.get("/products", response_model=ProductPage)
def list_products(
    q: str | None = Query(default=None, max_length=200),
    brand_id: list[int] = Query(default=[]),
    gender: list[Gender] = Query(default=[]),
    category: list[str] = Query(default=[]),
    type: list[str] = Query(default=[]),
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    # A node of the catalog tree: its products and those of all its groups.
    category_id: int | None = None,
    is_new: bool = False,
    on_sale: bool = False,
    promotion_id: int | None = None,
    # Products with a tester cheaper than its bottle («Тестеры» on the home page).
    tester: bool = False,
    # Brands in the home page's top houses (brands.is_top): «Ниша и люкс».
    top: bool = False,
    # These products only, for «Вы смотрели» (the device remembers the ids).
    id: list[int] = Query(default=[], max_length=50),
    sort: ProductSort = ProductSort.default,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    tier = max_tier_for_role(user.role if user else None)
    # The price this viewer pays, promotions included (pricing.deal_price).
    price = promotions.price_expr(tier)

    agg = (
        select(
            ProductVariant.product_id.label("product_id"),
            func.min(price).label("min_price"),
            func.sum(ProductVariant.stock).label("stock"),
        )
        .join(Product, Product.id == ProductVariant.product_id)
        .where(ProductVariant.is_active)
        .group_by(ProductVariant.product_id)
        .subquery()
    )

    conditions = [Product.is_active]
    if category_id is not None:
        conditions.append(_in_category(db, category_id))
    if brand_id:
        conditions.append(Product.brand_id.in_(brand_id))
    if gender:
        conditions.append(Product.gender.in_(gender))
    if category:
        conditions.append(Product.category.in_(category))
    if type:
        conditions.append(Product.type.in_(type))
    if is_new:
        conditions.append(Product.new_at.is_not(None))
    if on_sale:
        conditions.append(promotions.on_sale())
    if promotion_id is not None:
        conditions.append(promotions.in_promotion(promotion_id))
    if id:
        conditions.append(Product.id.in_(id))
    if top:
        conditions.append(Brand.is_top)
    if tester:
        bottle = ProductVariant.__table__.alias("bottle")
        conditions.append(
            exists().where(
                ProductVariant.product_id == Product.id,
                ProductVariant.is_active,
                ProductVariant.is_tester,
                exists().where(
                    bottle.c.product_id == Product.id,
                    bottle.c.is_active,
                    bottle.c.is_tester.is_(False),
                    bottle.c.volume_ml == ProductVariant.volume_ml,
                ),
            )
        )
    if min_price is not None or max_price is not None:
        variant_conds = [ProductVariant.product_id == Product.id, ProductVariant.is_active]
        if min_price is not None:
            variant_conds.append(price >= min_price)
        if max_price is not None:
            variant_conds.append(price <= max_price)
        conditions.append(exists().where(*variant_conds))

    sold = (
        select(OrderItem.product_id.label("product_id"), func.sum(OrderItem.quantity).label("sold"))
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.status != OrderStatus.cancelled,
            Order.created_at >= func.now() - text(f"interval '{POPULAR_DAYS} days'"),
        )
        .group_by(OrderItem.product_id)
        .subquery()
    )

    def matching(*more):
        return (
            select(Product.id, agg.c.min_price, sold.c.sold)
            .join(Brand, Brand.id == Product.brand_id)
            .outerjoin(agg, agg.c.product_id == Product.id)
            .outerjoin(sold, sold.c.product_id == Product.id)
            .where(*conditions, *more)
        )

    def count(stmt) -> int:
        return db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    search = q.strip() if q else ""
    base = matching(product_name_match(search)) if search else matching()
    total = count(base)
    # Nothing has these words: the closest products instead (a typo, an odd spelling).
    similarity = None
    if search and total == 0:
        similarity = product_similarity(search)
        base = matching(similarity >= SIMILAR)
        total = count(base)

    order_by = {
        ProductSort.default: [
            agg.c.min_price.is_(None),
            (func.coalesce(agg.c.stock, 0) > 0).desc(),
            Brand.name,
            Product.name,
        ],
        ProductSort.name: [Brand.name, Product.name],
        ProductSort.price_asc: [agg.c.min_price.asc().nulls_last(), Product.name],
        ProductSort.price_desc: [agg.c.min_price.desc().nulls_last(), Product.name],
        # Marked «Новинка» first (the latest marked first), then the latest added.
        ProductSort.new: [
            Product.new_at.desc().nulls_last(),
            Product.created_at.desc(),
            Product.id.desc(),
        ],
        # While the shop has few sales, the marked and the latest products fill the list.
        ProductSort.popular: [
            sold.c.sold.desc().nulls_last(),
            Product.new_at.desc().nulls_last(),
            Product.created_at.desc(),
            Product.id.desc(),
        ],
    }[sort]
    if similarity is not None and sort == ProductSort.default:
        order_by = [similarity.desc(), *order_by]

    rows = db.execute(
        base.order_by(*order_by, Product.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    ids = [r.id for r in rows]
    min_prices = {r.id: r.min_price for r in rows}
    sold_counts = {r.id: int(r.sold or 0) for r in rows}

    products = {
        p.id: p
        for p in db.scalars(
            select(Product)
            .where(Product.id.in_(ids))
            .options(joinedload(Product.brand), joinedload(Product.catalog_category))
        )
    }
    variants_by_product: dict[int, list[ProductVariant]] = {pid: [] for pid in ids}
    for v in db.scalars(
        select(ProductVariant)
        .where(ProductVariant.product_id.in_(ids), ProductVariant.is_active)
        .order_by(ProductVariant.volume_ml)
    ):
        variants_by_product[v.product_id].append(v)

    deals = promotions.deals_for(db, products.values())
    items = [
        ProductListItem(
            **_list_item_fields(
                products[pid], variants_by_product[pid], min_prices[pid], user, deals.get(pid)
            ),
            sold=sold_counts[pid] if sort == ProductSort.popular else None,
        )
        for pid in ids
    ]
    return ProductPage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        similar=similarity is not None and total > 0,
    )


@router.get("/products/{product_id}", response_model=ProductDetail)
def get_product(
    product_id: int,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    product = db.scalar(
        select(Product)
        .where(Product.id == product_id, Product.is_active)
        .options(
            joinedload(Product.brand),
            joinedload(Product.catalog_category),
            selectinload(Product.variants),
        )
    )
    if product is None:
        raise HTTPException(404, "Товар не найден")
    variants = [v for v in product.variants if v.is_active]
    teaser = teaser_tier(user.role if user else None, get_pricing_settings(db))
    deal = promotions.deals_for(db, [product]).get(product.id)
    public_variants = [variant_public(v, user, teaser, deal) for v in variants]
    min_price = min((v.price for v in public_variants), default=None)
    return ProductDetail(
        **_list_item_fields(product, variants, min_price, user, deal),
        category_path=[
            CategoryBrief(id=c.id, name=c.name)
            for c in (
                categories.load_tree(db).path(product.category_id) if product.category_id else []
            )
        ],
        top_notes=product.top_notes,
        mid_notes=product.mid_notes,
        base_notes=product.base_notes,
        description=product.description,
        variants=public_variants,
    )


def _brand_counts():
    return (
        select(Brand, func.count(Product.id).label("cnt"))
        .outerjoin(Product, and_(Product.brand_id == Brand.id, Product.is_active))
        .group_by(Brand.id)
    )


@router.get("/sitemap", response_model=SitemapOut)
def sitemap(db: Session = Depends(get_db)):
    """The products a guest can buy (shown, with a volume on sale) and their brands."""
    on_sale = exists().where(ProductVariant.product_id == Product.id, ProductVariant.is_active)
    rows = db.execute(
        select(Product.id, Product.updated_at, Product.brand_id)
        .where(Product.is_active, on_sale)
        .order_by(Product.id)
    ).all()
    return SitemapOut(
        products=[SitemapProduct(id=i, updated_at=u) for i, u, _ in rows],
        brand_ids=sorted({b for _, _, b in rows}),
    )


@router.get("/brands", response_model=list[BrandOut])
def list_brands(q: str | None = Query(default=None, max_length=100), db: Session = Depends(get_db)):
    stmt = _brand_counts().order_by(Brand.name)
    if q and q.strip():
        stmt = stmt.where(brand_name_match(q))
    return [BrandOut.of(b, c) for b, c in db.execute(stmt).all() if c > 0]


@router.get("/brands/{brand_id}", response_model=BrandOut)
def get_brand(brand_id: int, db: Session = Depends(get_db)):
    row = db.execute(_brand_counts().where(Brand.id == brand_id)).first()
    if row is None:
        raise HTTPException(404, "Бренд не найден")
    b, c = row
    return BrandOut.of(b, c)


def _in_category(db: Session, category_id: int):
    """The product is in this node of the catalog tree or under it."""
    ids = categories.load_tree(db).subtree_ids(category_id)
    return Product.category_id.in_(ids) if ids else false()


@router.get("/categories", response_model=list[CategoryPublic])
def list_categories(db: Session = Depends(get_db)):
    """The catalog tree with active products: the sections (parent_id null, the home page's
    tiles) in their order, each followed by its groups. Each has a picture."""
    tree = categories.load_tree(db)
    counts = categories.product_counts(db, tree, active_only=True)
    images = categories.tile_images(db, tree)
    out: list[CategoryPublic] = []
    stack = list(reversed(tree.children.get(None, [])))
    while stack:
        c = stack.pop()
        if counts[c.id] == 0:
            continue
        out.append(
            CategoryPublic(
                id=c.id,
                parent_id=c.parent_id,
                name=c.name,
                kind=c.kind,
                image_url=images.get(c.id),
                product_count=counts[c.id],
            )
        )
        stack.extend(reversed(tree.children.get(c.id, [])))
    return out


@router.get("/filters", response_model=FiltersOut)
def filters(
    category_id: int | None = None,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """What the catalog can be filtered by: across the shop, or within one section."""
    active = Product.is_active
    if category_id is not None:
        active = and_(active, _in_category(db, category_id))

    brand_counts = (
        select(Brand, func.count(Product.id).label("cnt"))
        .join(Product, and_(Product.brand_id == Brand.id, active))
        .group_by(Brand.id)
        .order_by(Brand.name)
    )
    brands = [
        FilterBrand(id=b.id, name=b.name, product_count=c)
        for b, c in db.execute(brand_counts).all()
        if c > 0
    ]

    def distinct(col):
        stmt = select(col).where(active, col.is_not(None), col != "").distinct().order_by(col)
        return list(db.scalars(stmt))

    genders = list(
        db.scalars(select(Product.gender).where(active, Product.gender.is_not(None)).distinct())
    )

    price = promotions.price_expr(max_tier_for_role(user.role if user else None))
    pmin, pmax = db.execute(
        select(func.min(price), func.max(price))
        .join(Product, Product.id == ProductVariant.product_id)
        .where(active, ProductVariant.is_active)
    ).one()

    return FiltersOut(
        brands=brands,
        genders=sorted(genders, key=lambda g: list(Gender).index(g)),
        categories=distinct(Product.category),
        types=distinct(Product.type),
        price_min=pmin,
        price_max=pmax,
    )


@router.get("/pricing/rules", response_model=PricingRulesOut)
def pricing_rules(
    user: User | None = Depends(get_current_user_optional), db: Session = Depends(get_db)
):
    s = get_pricing_settings(db)
    role = user.role if user else None
    tiers = visible_tiers(role)
    out = PricingRulesOut(
        mode=s.mode, role=role, max_tier=max_tier_for_role(role), visible_tiers=tiers
    )
    if PriceTier.wholesale in tiers:
        out.wholesale_min_order_amount = s.wholesale_min_order_amount
        out.wholesale_min_item_qty = s.wholesale_min_item_qty
    if PriceTier.bulk in tiers:
        out.bulk_min_order_amount = s.bulk_min_order_amount
        out.bulk_min_item_qty = s.bulk_min_item_qty
    out.next_role = next_role(role) if user else None
    out.next_tier = teaser_tier(role, s)
    if out.next_tier:
        out.next_tier_terms = s.next_tier_terms
    return out


@router.get("/promotions", response_model=list[PromotionPublic])
def running_promotions(db: Session = Depends(get_db)):
    """Promotions running today: the banners of the home page."""
    return db.scalars(
        select(Promotion).where(promotions.running()).order_by(Promotion.id.desc())
    ).all()


@router.get("/promotions/{promotion_id}", response_model=PromotionPublic)
def get_promotion(promotion_id: int, db: Session = Depends(get_db)):
    promotion = db.scalar(
        select(Promotion).where(Promotion.id == promotion_id, promotions.running())
    )
    if promotion is None:
        raise HTTPException(404, "Акция не найдена или уже закончилась")
    return promotion


@router.get("/currency", response_model=CurrencyOut)
def currency(db: Session = Depends(get_db)):
    """Tenge per dollar for the ₸ / $ switch. The parts of the rate stay in the admin panel."""
    row = rates.refresh_if_stale(db)
    return CurrencyOut(usd_rate=row.effective_rate, updated_at=row.source_updated_at)
