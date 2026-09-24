from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db import get_db
from app.deps import require_admin
from app.models import Brand, Product, ProductVariant, StockMovement, StockReason, User
from app.schemas.admin import (
    AdminProductOut,
    AdminVariantOut,
    BrandIn,
    BrandUpdate,
    ProductIn,
    ProductUpdate,
    StockMovementOut,
    VariantIn,
    VariantUpdate,
    check_price_order,
)
from app.schemas.catalog import BrandOut
from app.schemas.common import Page
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
    return [
        BrandOut(
            id=b.id, name=b.name, logo_url=b.logo_url, description=b.description, product_count=c
        )
        for b, c in db.execute(stmt).all()
    ]


@router.post("/brands", response_model=BrandOut, status_code=status.HTTP_201_CREATED)
def create_brand(data: BrandIn, db: Session = Depends(get_db)):
    brand = Brand(**data.model_dump())
    db.add(brand)
    _commit(db, "Бренд с таким названием уже существует")
    return BrandOut(**data.model_dump(), id=brand.id, product_count=0)


@router.patch("/brands/{brand_id}", response_model=BrandOut)
def update_brand(brand_id: int, data: BrandUpdate, db: Session = Depends(get_db)):
    brand = db.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(404, "Бренд не найден")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(brand, k, v.strip() if k == "name" and v else v)
    _commit(db, "Бренд с таким названием уже существует")
    count = db.scalar(select(func.count(Product.id)).where(Product.brand_id == brand.id)) or 0
    return BrandOut(
        id=brand.id,
        name=brand.name,
        logo_url=brand.logo_url,
        description=brand.description,
        product_count=count,
    )


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


@router.get("/products", response_model=Page[AdminProductOut])
def list_products(
    q: str | None = Query(default=None, max_length=200),
    brand_id: int | None = None,
    is_active: bool | None = None,
    no_variants: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    conds = []
    if q and q.strip():
        conds.append(product_name_match(q))
    if brand_id is not None:
        conds.append(Product.brand_id == brand_id)
    if is_active is not None:
        conds.append(Product.is_active == is_active)
    if no_variants:
        conds.append(~Product.variants.any())

    base = select(Product).join(Brand, Brand.id == Product.brand_id).where(*conds)
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


@router.get("/products/{product_id}", response_model=AdminProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    return _load_product(db, product_id)


@router.post("/products", response_model=AdminProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    data: ProductIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    if db.get(Brand, data.brand_id) is None:
        raise HTTPException(422, "Бренд не найден")
    volumes = [v.volume_ml for v in data.variants]
    if len(volumes) != len(set(volumes)):
        raise HTTPException(422, "Объёмы вариантов не должны повторяться")
    product = Product(**data.model_dump(exclude={"variants"}))
    for v in data.variants:
        variant = ProductVariant(**v.model_dump(exclude={"stock"}), stock=0)
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
    for k, v in changes.items():
        setattr(product, k, v)
    db.commit()
    return _load_product(db, product_id)


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
    variant = ProductVariant(product_id=product_id, **data.model_dump(exclude={"stock"}), stock=0)
    db.add(variant)
    set_stock(db, variant, data.stock, StockReason.manual, user=admin, note="Начальный остаток")
    _commit(db, "Такой объём у товара уже есть, или артикул (SKU) занят")
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
    stock_note = changes.pop("stock_note", None)
    new_stock = changes.pop("stock", None)
    if new_stock is not None:
        set_stock(db, variant, new_stock, StockReason.manual, user=admin, note=stock_note)
    for k, v in changes.items():
        setattr(variant, k, v)
    _commit(db, "Такой объём у товара уже есть, или артикул (SKU) занят")
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
