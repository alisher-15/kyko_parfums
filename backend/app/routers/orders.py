from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, get_current_user_optional
from app.models import (
    Order,
    OrderChannel,
    OrderEventKind,
    OrderItem,
    OrderReturn,
    OrderStatus,
    StockReason,
    User,
)
from app.pricing import Quote, QuoteItem, build_quote, price_for_tier, teaser_tier
from app.schemas.common import Page
from app.schemas.orders import (
    CheckoutIn,
    OrderBrief,
    OrderOut,
    QuoteIn,
    QuoteLineOut,
    QuoteOut,
    TierHintOut,
)
from app.services.orders import (
    add_event,
    change_status,
    load_sellable_variants,
    order_load_options,
)
from app.services.settings import get_pricing_settings
from app.services.stock import move_stock

router = APIRouter(tags=["cart & orders"])


def _quote_out(quote: Quote, unavailable: list[int]) -> QuoteOut:
    lines = []
    for line in quote.lines:
        v = line.variant
        p = v.product
        lines.append(
            QuoteLineOut(
                variant_id=v.id,
                product_id=p.id,
                product_name=p.name,
                brand_name=p.brand.name,
                volume_ml=v.volume_ml,
                image_url=v.photo_url or p.image_url,
                quantity=line.quantity,
                stock=v.stock,
                available=v.stock >= line.quantity,
                price_tier=line.tier,
                unit_price=line.unit_price,
                retail_unit_price=line.retail_unit_price,
                line_total=line.line_total,
            )
        )
    return QuoteOut(
        mode=quote.mode,
        lines=lines,
        unavailable_variant_ids=unavailable,
        total=quote.total,
        retail_total=quote.retail_total,
        savings=quote.retail_total - quote.total,
        price_tier=quote.tier,
        hints=[TierHintOut(**h.__dict__) for h in quote.hints],
        can_checkout=bool(lines) and not unavailable and all(line.available for line in lines),
    )


@router.post("/cart/quote", response_model=QuoteOut)
def quote_cart(
    data: QuoteIn,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Price a cart for the current user (guest => retail). The cart itself lives on the client."""
    quantities: dict[int, int] = {}
    for item in data.items:
        quantities[item.variant_id] = quantities.get(item.variant_id, 0) + item.quantity
    variants = load_sellable_variants(db, quantities)
    items = [QuoteItem(variants[vid], qty) for vid, qty in quantities.items() if vid in variants]
    unavailable = [vid for vid in quantities if vid not in variants]
    settings = get_pricing_settings(db)
    role = user.role if user else None
    quote = build_quote(items, role, settings)
    out = _quote_out(quote, unavailable)
    teaser = teaser_tier(role, settings)
    if teaser and items:
        next_total = sum(
            (price_for_tier(i.variant, teaser) * i.quantity for i in items), Decimal(0)
        )
        if next_total < quote.total:
            out.next_tier, out.next_tier_total = teaser, next_total
    return out


@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    data: CheckoutIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    settings = get_pricing_settings(db)
    variants = load_sellable_variants(db, (i.variant_id for i in data.items), lock=True)

    missing = [i.variant_id for i in data.items if i.variant_id not in variants]
    if missing:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"message": "Некоторые товары больше недоступны", "variant_ids": missing},
        )
    short = [
        {"variant_id": i.variant_id, "requested": i.quantity, "stock": variants[i.variant_id].stock}
        for i in data.items
        if variants[i.variant_id].stock < i.quantity
    ]
    if short:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, {"message": "Недостаточно товара на складе", "items": short}
        )

    quote = build_quote(
        [QuoteItem(variants[i.variant_id], i.quantity) for i in data.items], user.role, settings
    )
    order = Order(
        user_id=user.id,
        channel=OrderChannel.online,
        status=OrderStatus.new,
        total_amount=quote.total,
        customer_role=user.role,
        contact_name=data.contact_name.strip(),
        contact_phone=data.contact_phone.strip(),
        contact_email=data.contact_email or user.email,
        delivery_city=data.delivery_city.strip(),
        delivery_address=data.delivery_address.strip(),
        comment=data.comment,
    )
    for line in quote.lines:
        v = line.variant
        move_stock(db, v, -line.quantity, StockReason.online_order, order=order, user=user)
        order.items.append(
            OrderItem(
                variant_id=v.id,
                quantity=line.quantity,
                original_quantity=line.quantity,
                list_price=line.unit_price,
                discount_percent=0,
                price_applied=line.unit_price,
                price_tier=line.tier,
                brand_name=v.product.brand.name,
                product_name=v.product.name,
                product_id=v.product_id,
                volume_ml=v.volume_ml,
                cost_price=v.cost_price,
            )
        )
    add_event(order, OrderEventKind.created, "Заказ оформлен на сайте", user)
    db.add(order)
    db.commit()
    return _own_order(db, order.id, user)


@router.get("/orders", response_model=Page[OrderBrief])
def my_orders(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total = db.scalar(select(func.count(Order.id)).where(Order.user_id == user.id)) or 0
    items_count = (
        select(func.coalesce(func.sum(OrderItem.quantity), 0))
        .where(OrderItem.order_id == Order.id)
        .scalar_subquery()
    )
    returned = (
        select(func.coalesce(func.sum(OrderReturn.refund_amount), 0))
        .where(OrderReturn.order_id == Order.id)
        .scalar_subquery()
    )
    rows = db.execute(
        select(Order, items_count.label("items_count"), returned)
        .where(Order.user_id == user.id)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [
        OrderBrief(
            id=o.id,
            channel=o.channel,
            status=o.status,
            total_amount=o.total_amount,
            returned_amount=ret,
            created_at=o.created_at,
            items_count=cnt,
        )
        for o, cnt, ret in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


def _own_order(db: Session, order_id: int, user: User, lock: bool = False) -> Order:
    stmt = select(Order).where(Order.id == order_id, Order.user_id == user.id)
    if lock:
        stmt = stmt.with_for_update(of=Order)
    order = db.scalar(stmt.options(*order_load_options()).execution_options(populate_existing=True))
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    return order


@router.get("/orders/{order_id}", response_model=OrderOut)
def my_order(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _own_order(db, order_id, user)


@router.post("/orders/{order_id}/cancel", response_model=OrderOut)
def cancel_my_order(
    order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    order = _own_order(db, order_id, user, lock=True)
    if order.status != OrderStatus.new:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Отменить можно только новый заказ — свяжитесь с менеджером"
        )
    change_status(db, order, OrderStatus.cancelled, user)
    db.commit()
    return _own_order(db, order_id, user)
