from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db import get_db
from app.deps import require_admin
from app.models import (
    Brand,
    Category,
    PriceChange,
    Product,
    ProductVariant,
    StockMovement,
    StockReason,
    User,
    volume_label,
)
from app.schemas.admin import (
    AdminProductOut,
    AdminVariantOut,
    BrandIn,
    BrandUpdate,
    PriceChangeOut,
    ProductIn,
    ProductUpdate,
    StockMovementOut,
    VariantIn,
    VariantUpdate,
    check_price_order,
)
from app.schemas.catalog import BrandOut
from app.schemas.common import Page
from app.services import categories, markups, price_history
from app.services.importer import build_export
from app.services.search import contains, product_name_match
from app.services.stock import set_stock

router = APIRouter()


def _commit(db: Session, conflict_message: str) -> None:
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, conflict_message) from e


# ---------- Brands ----------


@router.get("/brands", response_model=list[BrandOut])
def list_brands(q: str | None = None, db: Session = Depends(get_db)):
    stmt = (
        select(Brand, func.count(Product.id))
        .outerjoin(Product, Product.brand_id == Brand.id)
        .group_by(Brand.id)
        .order_by(Brand.name)
    )
    if q:
        stmt = stmt.where(Brand.name.ilike(contains(q)))
    return [BrandOut.of(b, c) for b, c in db.execute(stmt).all()]


@router.post("/brands", response_model=BrandOut, status_code=status.HTTP_201_CREATED)
def create_brand(data: BrandIn, db: Session = Depends(get_db)):
    # Unset, is_top is the column's default: a top house by its name.
    brand = Brand(**data.model_dump(exclude_none=True))
    db.add(brand)
    _commit(db, "Бренд с таким названием уже существует")
    return BrandOut.of(brand, 0)


@router.patch("/brands/{brand_id}", response_model=BrandOut)
def update_brand(brand_id: int, data: BrandUpdate, db: Session = Depends(get_db)):
    brand = db.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(404, "Бренд не найден")
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == "is_top" and v is None:
            continue
        setattr(brand, k, v.strip() if k == "name" and v else v)
    _commit(db, "Бренд с таким названием уже существует")
    count = db.scalar(select(func.count(Product.id)).where(Product.brand_id == brand.id)) or 0
    return BrandOut.of(brand, count)


@router.delete("/brands/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_brand(brand_id: int, db: Session = Depends(get_db)):
    brand = db.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(404, "Бренд не найден")
    if db.scalar(select(func.count(Product.id)).where(Product.brand_id == brand_id)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "У бренда есть товары — сначала удалите или перенесите их"
        )
    db.delete(brand)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Products ----------


def _load_product(db: Session, product_id: int) -> Product:
    product = db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(
            joinedload(Product.brand),
            selectinload(Product.variants).selectinload(ProductVariant.barcodes),
        )
    )
    if product is None:
        raise HTTPException(404, "Товар не найден")
    return product


class PriceCheck(StrEnum):
    # A price under the cost: the shop loses on every sale.
    below_cost = "below_cost"
    # The markup is MARKUP_DRIFT points under the one the volume remembers: the cost went up
    # (a receipt's average) and the price didn't; or a price was lowered by hand.
    markup_down = "markup_down"
    # And over it: the cost went down, the price stayed (prices never go down by themselves).
    markup_up = "markup_up"


MARKUP_DRIFT = Decimal(5)


def _price_check(check: PriceCheck):
    """A volume on sale whose prices fail the check."""
    v = ProductVariant
    cost = v.cost_price
    levels = [
        (v.retail_price, v.retail_markup),
        (v.wholesale_price, v.wholesale_markup),
        (v.bulk_price, v.bulk_markup),
    ]
    if check == PriceCheck.below_cost:
        failing = or_(*(price < cost for price, _ in levels))
    else:
        drifted = []
        for price, markup in levels:
            actual = (price / cost - 1) * 100
            off = (
                actual < markup - MARKUP_DRIFT
                if check == PriceCheck.markup_down
                else actual > markup + MARKUP_DRIFT
            )
            drifted.append(and_(price.is_not(None), markup.is_not(None), off))
        failing = or_(*drifted)
    return Product.variants.any(and_(v.is_active, cost > 0, failing))


@dataclass
class ProductFilters:
    conds: list[Any]
    no_barcode: bool


def product_filters(
    q: str | None = Query(default=None, max_length=200),
    brand_id: int | None = None,
    is_active: bool | None = None,
    no_variants: bool = False,
    backordered: bool = False,
    is_new: bool = False,
    no_photo: bool = False,
    no_barcode: bool = False,
    price_check: PriceCheck | None = None,
    # A node of the catalog tree with everything under it; 0: products not placed yet.
    category_id: int | None = None,
    db: Session = Depends(get_db),
) -> ProductFilters:
    """The filters of the products list, shared by the list and its Excel export."""
    conds: list[Any] = []
    if category_id == 0:
        conds.append(Product.category_id.is_(None))
    elif category_id is not None:
        conds.append(Product.category_id.in_(categories.load_tree(db).subtree_ids(category_id)))
    if q and q.strip():
        conds.append(product_name_match(q))
    if brand_id is not None:
        conds.append(Product.brand_id == brand_id)
    if is_active is not None:
        conds.append(Product.is_active == is_active)
    if no_variants:
        conds.append(~Product.variants.any())
    if backordered:
        # Customers ordered more than the shop has: these must be bought from a supplier.
        conds.append(Product.variants.any(ProductVariant.stock < 0))
    if is_new:
        conds.append(Product.new_at.is_not(None))
    if no_photo:
        # The shop shows the product's photo, else a bottle's (see the catalog): neither is set.
        conds.append(func.coalesce(Product.image_url, "") == "")
        conds.append(~Product.variants.any(func.coalesce(ProductVariant.photo_url, "") != ""))
    if no_barcode:
        # A volume nothing scans to yet: the barcode goes in at the next receipt.
        conds.append(Product.variants.any(~ProductVariant.barcodes.any()))
    if price_check is not None:
        conds.append(_price_check(price_check))
    return ProductFilters(conds=conds, no_barcode=no_barcode)


@router.get("/products", response_model=Page[AdminProductOut])
def list_products(
    filters: ProductFilters = Depends(product_filters),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    base = select(Product).join(Brand, Brand.id == Product.brand_id).where(*filters.conds)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(
        base.options(
            joinedload(Product.brand),
            selectinload(Product.variants).selectinload(ProductVariant.barcodes),
        )
        .order_by(Brand.name, Product.name, Product.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/products/export")
def export_products(
    filters: ProductFilters = Depends(product_filters), db: Session = Depends(get_db)
):
    """The listed products in the import format; «Без штрихкода» keeps the volumes without one."""
    return Response(
        content=build_export(db, filters.conds, only_without_barcode=filters.no_barcode),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="catalog.xlsx"'},
    )


@router.get("/products/{product_id}", response_model=AdminProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    return _load_product(db, product_id)


@router.post("/products", response_model=AdminProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    data: ProductIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    if db.get(Brand, data.brand_id) is None:
        raise HTTPException(422, "Бренд не найден")
    if data.category_id is None:
        # Apps from before the catalog tree send no category: their products are perfumes.
        default = categories.default_perfume_section(db)
        data.category_id = default.id if default else None
    elif db.get(Category, data.category_id) is None:
        raise HTTPException(422, "Категория не найдена")
    kinds = [(v.volume_ml, v.is_tester) for v in data.variants]
    if len(kinds) != len(set(kinds)):
        raise HTTPException(422, "Объёмы вариантов не должны повторяться")
    product = Product(**data.model_dump(exclude={"variants", "is_new"}))
    _mark_new(product, data.is_new)
    for v in data.variants:
        variant = ProductVariant(**v.model_dump(exclude={"stock"}), stock=0)
        markups.remember(variant)
        product.variants.append(variant)
        set_stock(db, variant, v.stock, StockReason.manual, user=admin, note="Начальный остаток")
    db.add(product)
    _commit(db, "Конфликт данных: проверьте уникальность артикулов (SKU)")
    return _load_product(db, product.id)


@router.patch("/products/{product_id}", response_model=AdminProductOut)
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db)):
    product = _load_product(db, product_id)
    changes = data.model_dump(exclude_unset=True)
    if "brand_id" in changes and db.get(Brand, changes["brand_id"]) is None:
        raise HTTPException(422, "Бренд не найден")
    if "category_id" in changes:
        if changes["category_id"] is None:
            changes.pop("category_id")  # a product stays placed
        elif db.get(Category, changes["category_id"]) is None:
            raise HTTPException(422, "Категория не найдена")
    if "is_new" in changes:
        _mark_new(product, changes.pop("is_new"))
    for k, v in changes.items():
        setattr(product, k, v)
    db.commit()
    return _load_product(db, product_id)


def _mark_new(product: Product, is_new: bool | None) -> None:
    """Marking keeps the first date: the home page shows the latest marked first."""
    if is_new and product.new_at is None:
        product.new_at = datetime.now(UTC)
    elif is_new is False:
        product.new_at = None


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    """Hard delete. Past orders keep their item snapshots (variant_id becomes NULL)."""
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Товар не найден")
    db.delete(product)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Variants ----------

VARIANT_CONFLICT = "Такой вариант у товара уже есть, или артикул (SKU) занят"
# Set by hand, these make the volume remember its markups (services/markups.py).
PRICE_FIELDS = ("retail_price", "wholesale_price", "bulk_price", "cost_price")


def _check_unique_volume(
    db: Session, product_id: int, volume_ml: int, is_tester: bool, variant_id: int | None = None
) -> None:
    """A product has one variant per volume, and one tester per volume."""
    same = select(ProductVariant.id).where(
        ProductVariant.product_id == product_id,
        ProductVariant.volume_ml == volume_ml,
        ProductVariant.is_tester == is_tester,
    )
    if variant_id is not None:
        same = same.where(ProductVariant.id != variant_id)
    if db.scalar(same.limit(1)) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"У товара уже есть {volume_label(volume_ml, is_tester)}"
        )


@router.post(
    "/products/{product_id}/variants",
    response_model=AdminVariantOut,
    status_code=status.HTTP_201_CREATED,
)
def create_variant(
    product_id: int,
    data: VariantIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if db.get(Product, product_id) is None:
        raise HTTPException(404, "Товар не найден")
    _check_unique_volume(db, product_id, data.volume_ml, data.is_tester)
    variant = ProductVariant(product_id=product_id, **data.model_dump(exclude={"stock"}), stock=0)
    markups.remember(variant)
    db.add(variant)
    set_stock(db, variant, data.stock, StockReason.manual, user=admin, note="Начальный остаток")
    _commit(db, VARIANT_CONFLICT)
    return variant


@router.patch("/variants/{variant_id}", response_model=AdminVariantOut)
def update_variant(
    variant_id: int,
    data: VariantUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    variant = db.get(ProductVariant, variant_id, with_for_update=True)
    if variant is None:
        raise HTTPException(404, "Вариант не найден")
    changes = data.model_dump(exclude_unset=True)
    for required in ("volume_ml", "is_tester"):
        if required in changes and changes[required] is None:
            del changes[required]
    if changes.get("retail_price", variant.retail_price) is None:
        raise HTTPException(422, "Розничная цена обязательна")
    try:
        check_price_order(
            changes.get("retail_price", variant.retail_price),
            changes.get("wholesale_price", variant.wholesale_price),
            changes.get("bulk_price", variant.bulk_price),
        )
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    if "volume_ml" in changes or "is_tester" in changes:
        _check_unique_volume(
            db,
            variant.product_id,
            changes.get("volume_ml", variant.volume_ml),
            changes.get("is_tester", variant.is_tester),
            variant.id,
        )
    stock_note = changes.pop("stock_note", None)
    new_stock = changes.pop("stock", None)
    if new_stock is not None:
        set_stock(db, variant, new_stock, StockReason.manual, user=admin, note=stock_note)
    repriced = any(changes.get(k, getattr(variant, k)) != getattr(variant, k) for k in PRICE_FIELDS)
    price_history.label(db, "Админка", admin)
    for k, v in changes.items():
        setattr(variant, k, v)
    if repriced:
        markups.remember(variant)
    _commit(db, VARIANT_CONFLICT)
    db.refresh(variant)
    return variant


@router.delete("/variants/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_variant(variant_id: int, db: Session = Depends(get_db)):
    variant = db.get(ProductVariant, variant_id)
    if variant is None:
        raise HTTPException(404, "Вариант не найден")
    db.delete(variant)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/products/{product_id}/price-history", response_model=list[PriceChangeOut])
def price_history_of(
    product_id: int,
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Latest changes of the costs and prices of all volumes of a product."""
    if db.get(Product, product_id) is None:
        raise HTTPException(404, "Товар не найден")
    rows = db.execute(
        select(PriceChange, ProductVariant, User.email)
        .join(ProductVariant, ProductVariant.id == PriceChange.variant_id)
        .outerjoin(User, User.id == PriceChange.user_id)
        .where(ProductVariant.product_id == product_id)
        .order_by(PriceChange.created_at.desc(), PriceChange.id.desc())
        .limit(limit)
    ).all()
    return [
        PriceChangeOut(
            id=c.id,
            variant_id=c.variant_id,
            volume_ml=v.volume_ml,
            is_tester=v.is_tester,
            field=c.field,
            old_value=c.old_value,
            new_value=c.new_value,
            source=c.source,
            user_email=email,
            created_at=c.created_at,
        )
        for c, v, email in rows
    ]


@router.get("/products/{product_id}/stock-movements", response_model=list[StockMovementOut])
def stock_movements(
    product_id: int,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Latest stock changes of all volumes of a product."""
    if db.get(Product, product_id) is None:
        raise HTTPException(404, "Товар не найден")
    rows = db.scalars(
        select(StockMovement)
        .join(ProductVariant, ProductVariant.id == StockMovement.variant_id)
        .where(ProductVariant.product_id == product_id)
        .options(joinedload(StockMovement.variant), joinedload(StockMovement.user))
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
        .limit(limit)
    )
    return [
        StockMovementOut(
            id=m.id,
            variant_id=m.variant_id,
            volume_ml=m.variant.volume_ml,
            is_tester=m.variant.is_tester,
            delta=m.delta,
            stock_after=m.stock_after,
            reason=m.reason,
            order_id=m.order_id,
            receipt_id=m.receipt_id,
            count_id=m.count_id,
            user_email=m.user.email if m.user else None,
            note=m.note,
            created_at=m.created_at,
        )
        for m in rows
    ]
