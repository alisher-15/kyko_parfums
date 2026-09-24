from decimal import Decimal
from enum import StrEnum

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db import get_db
from app.deps import get_current_user_optional
from app.models import Brand, Gender, PriceTier, Product, ProductVariant, User
from app.pricing import (
    max_tier_for_role,
    next_role,
    price_for_tier,
    teaser_tier,
    visible_tiers,
)
from app.schemas.catalog import (
    BrandBrief,
    BrandOut,
    FilterBrand,
    FiltersOut,
    PricingRulesOut,
    ProductDetail,
    ProductListItem,
    VariantPublic,
)
from app.schemas.common import Page
from app.services.settings import get_pricing_settings

router = APIRouter(tags=["catalog"])


class ProductSort(StrEnum):
    default = "default"
    name = "name"
    price_asc = "price_asc"
    price_desc = "price_desc"
    new = "new"


def tier_price_expr(tier: PriceTier):
    """SQL counterpart of ``pricing.price_for_tier``."""
    if tier == PriceTier.bulk:
        return func.coalesce(
            ProductVariant.bulk_price, ProductVariant.wholesale_price, ProductVariant.retail_price
        )
    if tier == PriceTier.wholesale:
        return func.coalesce(ProductVariant.wholesale_price, ProductVariant.retail_price)
    return ProductVariant.retail_price


def variant_public(
    variant: ProductVariant, user: User | None, teaser: PriceTier | None = None
) -> VariantPublic:
    role = user.role if user else None
    tier = max_tier_for_role(role)
    tiers = visible_tiers(role)
    price = price_for_tier(variant, tier)
    next_price = price_for_tier(variant, teaser) if teaser else None
    if next_price is not None and next_price >= price:
        next_price = None
    return VariantPublic(
        next_tier=teaser if next_price is not None else None,
        next_tier_price=next_price,
        id=variant.id,
        volume_ml=variant.volume_ml,
        sku=variant.sku,
        stock=variant.stock,
        photo_url=variant.photo_url,
        price=price,
        price_tier=tier,
        retail_price=variant.retail_price,
        wholesale_price=(
            price_for_tier(variant, PriceTier.wholesale) if PriceTier.wholesale in tiers else None
        ),
        bulk_price=price_for_tier(variant, PriceTier.bulk) if PriceTier.bulk in tiers else None,
    )


def _list_item_fields(
    product: Product, variants: list[ProductVariant], min_price: Decimal | None
) -> dict:
    image = product.image_url or next((v.photo_url for v in variants if v.photo_url), None)
    return dict(
        id=product.id,
        name=product.name,
        brand=BrandBrief.model_validate(product.brand),
        type=product.type,
        category=product.category,
        gender=product.gender,
        longevity=product.longevity,
        image_url=image,
        min_price=min_price,
        volumes=[v.volume_ml for v in variants],
        in_stock=any(v.stock > 0 for v in variants),
    )


def _search_clause(q: str):
    # Every word must match the brand or the product name: "chanel chance" finds Chance by Chanel.
    words = [w for w in q.split() if w]
    return and_(*(or_(Product.name.ilike(f"%{w}%"), Brand.name.ilike(f"%{w}%")) for w in words))


@router.get("/products", response_model=Page[ProductListItem])
def list_products(
    q: str | None = Query(default=None, max_length=200),
    brand_id: list[int] = Query(default=[]),
    gender: list[Gender] = Query(default=[]),
    category: list[str] = Query(default=[]),
    type: list[str] = Query(default=[]),
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    in_stock: bool = False,
    sort: ProductSort = ProductSort.default,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    tier = max_tier_for_role(user.role if user else None)
    price = tier_price_expr(tier)

    agg = (
        select(
            ProductVariant.product_id.label("product_id"),
            func.min(price).label("min_price"),
            func.sum(ProductVariant.stock).label("stock"),
        )
        .where(ProductVariant.is_active)
        .group_by(ProductVariant.product_id)
        .subquery()
    )

    conditions = [Product.is_active]
    if q and q.strip():
        conditions.append(_search_clause(q))
    if brand_id:
        conditions.append(Product.brand_id.in_(brand_id))
    if gender:
        conditions.append(Product.gender.in_(gender))
    if category:
        conditions.append(Product.category.in_(category))
    if type:
        conditions.append(Product.type.in_(type))
    if in_stock:
        conditions.append(agg.c.stock > 0)
    if min_price is not None or max_price is not None:
        variant_conds = [ProductVariant.product_id == Product.id, ProductVariant.is_active]
        if min_price is not None:
            variant_conds.append(price >= min_price)
        if max_price is not None:
            variant_conds.append(price <= max_price)
        conditions.append(exists().where(*variant_conds))

    base = (
        select(Product.id, agg.c.min_price)
        .join(Brand, Brand.id == Product.brand_id)
        .outerjoin(agg, agg.c.product_id == Product.id)
        .where(*conditions)
    )

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

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
        ProductSort.new: [Product.created_at.desc(), Product.id.desc()],
    }[sort]

    rows = db.execute(
        base.order_by(*order_by, Product.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    ids = [r.id for r in rows]
    min_prices = {r.id: r.min_price for r in rows}

    products = {
        p.id: p
        for p in db.scalars(
            select(Product).where(Product.id.in_(ids)).options(joinedload(Product.brand))
        )
    }
    variants_by_product: dict[int, list[ProductVariant]] = {pid: [] for pid in ids}
    for v in db.scalars(
        select(ProductVariant)
        .where(ProductVariant.product_id.in_(ids), ProductVariant.is_active)
        .order_by(ProductVariant.volume_ml)
    ):
        variants_by_product[v.product_id].append(v)

    items = [
        ProductListItem(
            **_list_item_fields(products[pid], variants_by_product[pid], min_prices[pid])
        )
        for pid in ids
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/products/{product_id}", response_model=ProductDetail)
def get_product(
    product_id: int,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    product = db.scalar(
        select(Product)
        .where(Product.id == product_id, Product.is_active)
        .options(joinedload(Product.brand), selectinload(Product.variants))
    )
    if product is None:
        raise HTTPException(404, "Товар не найден")
    variants = [v for v in product.variants if v.is_active]
    teaser = teaser_tier(user.role if user else None, get_pricing_settings(db))
    public_variants = [variant_public(v, user, teaser) for v in variants]
    min_price = min((v.price for v in public_variants), default=None)
    return ProductDetail(
        **_list_item_fields(product, variants, min_price),
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


@router.get("/brands", response_model=list[BrandOut])
def list_brands(q: str | None = Query(default=None, max_length=100), db: Session = Depends(get_db)):
    stmt = _brand_counts().order_by(Brand.name)
    if q:
        stmt = stmt.where(Brand.name.ilike(f"%{q.strip()}%"))
    return [
        BrandOut(
            id=b.id, name=b.name, logo_url=b.logo_url, description=b.description, product_count=c
        )
        for b, c in db.execute(stmt).all()
        if c > 0
    ]


@router.get("/brands/{brand_id}", response_model=BrandOut)
def get_brand(brand_id: int, db: Session = Depends(get_db)):
    row = db.execute(_brand_counts().where(Brand.id == brand_id)).first()
    if row is None:
        raise HTTPException(404, "Бренд не найден")
    b, c = row
    return BrandOut(
        id=b.id, name=b.name, logo_url=b.logo_url, description=b.description, product_count=c
    )


@router.get("/filters", response_model=FiltersOut)
def filters(user: User | None = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    active = Product.is_active

    brands = [
        FilterBrand(id=b.id, name=b.name, product_count=c)
        for b, c in db.execute(_brand_counts().order_by(Brand.name)).all()
        if c > 0
    ]

    def distinct(col):
        return [
            v
            for v in db.scalars(
                select(col).where(active, col.is_not(None), col != "").distinct().order_by(col)
            )
        ]

    genders = [
        g
        for g in db.scalars(
            select(Product.gender).where(active, Product.gender.is_not(None)).distinct()
        )
    ]

    price = tier_price_expr(max_tier_for_role(user.role if user else None))
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
