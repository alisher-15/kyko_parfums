"""Point of sale: sales made in the physical shop are entered by an admin as store orders."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import require_admin
from app.models import (
    Brand,
    Order,
    OrderChannel,
    OrderEventKind,
    OrderItem,
    OrderStatus,
    PriceTier,
    Product,
    ProductVariant,
    StockReason,
    User,
    UserRole,
    VariantBarcode,
)
from app.pricing import max_tier_for_role, price_for_tier
from app.schemas.admin import (
    AdminOrderOut,
    StoreQuoteIn,
    StoreQuoteLine,
    StoreQuoteOut,
    StoreSaleIn,
    VariantSearchItem,
)
from app.services.orders import add_event, order_load_options
from app.services.search import contains, product_name_match
from app.services.settings import get_pricing_settings
from app.services.stock import move_stock

router = APIRouter(prefix="/store")

CENT = Decimal("0.01")


def _image(v: ProductVariant) -> str | None:
    return v.photo_url or v.product.image_url


def variant_item(v: ProductVariant) -> VariantSearchItem:
    return VariantSearchItem(
        variant_id=v.id,
        product_id=v.product_id,
        brand_name=v.product.brand.name,
        product_name=v.product.name,
        volume_ml=v.volume_ml,
        sku=v.sku,
        image_url=_image(v),
        stock=v.stock,
        retail_price=v.retail_price,
        wholesale_price=v.wholesale_price,
        bulk_price=v.bulk_price,
        cost_price=v.cost_price,
        is_active=v.is_active,
        product_active=v.product.is_active,
    )


@router.get("/variants", response_model=list[VariantSearchItem])
def search_variants(
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Find volumes by barcode or SKU (exact match first) or by name/brand."""
    term = q.strip()
    exact_code = or_(
        func.lower(ProductVariant.sku) == term.lower(),
        ProductVariant.barcodes.any(VariantBarcode.code == term.replace(" ", "")),
    )
    stmt = (
        select(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .join(Brand, Brand.id == Product.brand_id)
        .where(
            ProductVariant.is_active,
            or_(exact_code, ProductVariant.sku.ilike(contains(term)), product_name_match(term)),
        )
        .options(joinedload(ProductVariant.product).joinedload(Product.brand))
        .order_by(
            case((exact_code, 0), else_=1), Brand.name, Product.name, ProductVariant.volume_ml
        )
        .limit(limit)
    )
    return [variant_item(v) for v in db.scalars(stmt)]


@dataclass
class _Line:
    variant: ProductVariant
    quantity: int
    list_price: Decimal
    discount_percent: Decimal
    unit_price: Decimal

    @property
    def total(self) -> Decimal:
        return self.unit_price * self.quantity


@dataclass
class _Priced:
    tier: PriceTier
    customer: User | None
    max_discount: Decimal
    lines: list[_Line]
    unavailable: list[int]
    errors: list[str]

    @property
    def subtotal(self) -> Decimal:
        return sum((ln.list_price * ln.quantity for ln in self.lines), Decimal(0))

    @property
    def total(self) -> Decimal:
        return sum((ln.total for ln in self.lines), Decimal(0))


def _price(db: Session, data: StoreQuoteIn | StoreSaleIn, lock: bool) -> _Priced:
    max_discount = Decimal(get_pricing_settings(db).max_store_discount_percent)
    customer = None
    if data.customer_id is not None:
        customer = db.get(User, data.customer_id)
        if customer is None:
            raise HTTPException(404, "Покупатель не найден")
    tier = data.price_tier or max_tier_for_role(customer.role if customer else None)

    ids = sorted({i.variant_id for i in data.items})
    stmt = (
        select(ProductVariant)
        .where(ProductVariant.id.in_(ids), ProductVariant.is_active)
        .order_by(ProductVariant.id)
    )
    if lock:
        stmt = stmt.with_for_update()
    variants = {v.id: v for v in db.scalars(stmt)} if ids else {}

    lines: list[_Line] = []
    errors: list[str] = []
    for item in data.items:
        v = variants.get(item.variant_id)
        if v is None:
            continue
        name = f"{v.product.name}, {v.volume_ml} мл"
        if item.discount_percent > max_discount:
            errors.append(f"{name}: скидка больше допустимой ({max_discount.normalize():f}%)")
        if v.stock < item.quantity:
            errors.append(f"{name}: на складе только {max(v.stock, 0)} шт.")
        list_price = price_for_tier(v, tier)
        unit = (list_price * (100 - item.discount_percent) / 100).quantize(CENT, ROUND_HALF_UP)
        lines.append(_Line(v, item.quantity, list_price, item.discount_percent, unit))
    unavailable = [i.variant_id for i in data.items if i.variant_id not in variants]
    if unavailable:
        errors.append("Некоторые позиции больше не продаются — уберите их из чека")
    return _Priced(tier, customer, max_discount, lines, unavailable, errors)


@router.post("/quote", response_model=StoreQuoteOut)
def quote(data: StoreQuoteIn, db: Session = Depends(get_db)):
    p = _price(db, data, lock=False)
    return StoreQuoteOut(
        price_tier=p.tier,
        max_discount_percent=float(p.max_discount),
        lines=[
            StoreQuoteLine(
                variant_id=ln.variant.id,
                product_id=ln.variant.product_id,
                brand_name=ln.variant.product.brand.name,
                product_name=ln.variant.product.name,
                volume_ml=ln.variant.volume_ml,
                sku=ln.variant.sku,
                image_url=_image(ln.variant),
                quantity=ln.quantity,
                stock=ln.variant.stock,
                available=ln.variant.stock >= ln.quantity,
                list_price=ln.list_price,
                discount_percent=float(ln.discount_percent),
                unit_price=ln.unit_price,
                line_total=ln.total,
            )
            for ln in p.lines
        ],
        unavailable_variant_ids=p.unavailable,
        subtotal=p.subtotal,
        discount_total=p.subtotal - p.total,
        total=p.total,
        errors=p.errors,
        can_submit=bool(p.lines) and not p.errors,
    )


@router.post("/sales", response_model=AdminOrderOut, status_code=status.HTTP_201_CREATED)
def create_sale(
    data: StoreSaleIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    """Record a sale made in the shop: the order is created as delivered and stock is deducted."""
    p = _price(db, data, lock=True)
    if p.errors:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, {"message": p.errors[0], "errors": p.errors})

    customer = p.customer
    order = Order(
        user_id=customer.id if customer else None,
        channel=OrderChannel.store,
        status=OrderStatus.delivered,
        total_amount=p.total,
        customer_role=customer.role if customer else UserRole.retail,
        payment_method=data.payment_method,
        created_by_id=admin.id,
        contact_name=data.customer_name or (customer.full_name if customer else None),
        contact_phone=data.customer_phone or (customer.phone if customer else None),
        contact_email=customer.email if customer else None,
        comment=data.comment,
    )
    db.add(order)
    for ln in p.lines:
        v = ln.variant
        order.items.append(
            OrderItem(
                variant_id=v.id,
                quantity=ln.quantity,
                original_quantity=ln.quantity,
                list_price=ln.list_price,
                discount_percent=ln.discount_percent,
                price_applied=ln.unit_price,
                price_tier=p.tier,
                brand_name=v.product.brand.name,
                product_name=v.product.name,
                product_id=v.product_id,
                volume_ml=v.volume_ml,
                cost_price=v.cost_price,
            )
        )
        move_stock(db, v, -ln.quantity, StockReason.store_sale, order=order, user=admin)
    add_event(order, OrderEventKind.created, "Продажа в магазине проведена", admin)
    db.commit()

    order = db.scalar(
        select(Order)
        .where(Order.id == order.id)
        .options(*order_load_options())
        .execution_options(populate_existing=True)
    )
    return AdminOrderOut.model_validate(order)
