import re
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
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
    UserRole,
)
from app.pricing import (
    Quote,
    QuoteItem,
    build_quote,
    discount_percent,
    price_for_tier,
    teaser_tier,
)
from app.schemas.common import Page
from app.schemas.orders import (
    CheckoutIn,
    OrderBrief,
    OrderOut,
    PlacedOrderOut,
    QuoteIn,
    QuoteLineOut,
    QuoteOut,
    TierHintOut,
)
from app.services import email, push, telegram
from app.services.orders import (
    add_event,
    change_status,
    guest_key,
    guest_key_is_good,
    load_sellable_variants,
    order_load_options,
    placed_before,
)
from app.services.promotions import deals_for_variants
from app.services.settings import get_pricing_settings
from app.services.stock import move_stock
from app.services.throttle import guest_orders, guest_orders_per_phone

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
                is_tester=v.is_tester,
                image_url=v.photo_url or p.image_url,
                quantity=line.quantity,
                price_tier=line.tier,
                unit_price=line.unit_price,
                retail_unit_price=line.retail_unit_price,
                line_total=line.line_total,
                promotion_title=line.deal.title if line.deal else None,
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
        # Missing units don't block checkout: they are ordered from a supplier (backorder).
        can_checkout=bool(lines) and not unavailable,
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
    deals = deals_for_variants(db, variants.values())
    items = [
        QuoteItem(variants[vid], qty, deals.get(vid))
        for vid, qty in quantities.items()
        if vid in variants
    ]
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


def _guest_checks(phone: str) -> str:
    """A guest's phone as digits, if it is a whole number and they may order now."""
    digits = re.sub(r"\D", "", phone)
    if not 10 <= len(digits) <= 15:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Укажите телефон полностью, например +7 700 123 45 67: по нему с вами свяжутся",
        )
    wait = max(guest_orders.retry_after("all"), guest_orders_per_phone.retry_after(digits))
    if wait:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Слишком много заказов без регистрации. Войдите в аккаунт или попробуйте "
            f"через {max(1, wait // 60)} мин.",
            headers={"Retry-After": str(wait)},
        )
    return digits


@router.post("/orders", response_model=PlacedOrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    data: CheckoutIn,
    background: BackgroundTasks,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    buyer_id = user.id if user else None
    # A retry of a checkout that went through (the answer was lost): the same order, once.
    again = placed_before(db, data.request_key, OrderChannel.online, buyer_id)
    if again is not None:
        return _placed_out(db, again, user)
    # Without an account: retail prices, a whole phone number, and a limit on such orders.
    phone = _guest_checks(data.contact_phone) if user is None else None
    role = user.role if user else UserRole.retail
    settings = get_pricing_settings(db)
    variants = load_sellable_variants(db, (i.variant_id for i in data.items), lock=True)

    missing = [i.variant_id for i in data.items if i.variant_id not in variants]
    if missing:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"message": "Некоторые товары больше недоступны", "variant_ids": missing},
        )

    deals = deals_for_variants(db, variants.values())
    quote = build_quote(
        [
            QuoteItem(variants[i.variant_id], i.quantity, deals.get(i.variant_id))
            for i in data.items
        ],
        role,
        settings,
    )
    order = Order(
        user_id=user.id if user else None,
        channel=OrderChannel.online,
        status=OrderStatus.new,
        total_amount=quote.total,
        customer_role=role,
        contact_name=data.contact_name.strip(),
        contact_phone=data.contact_phone.strip(),
        contact_email=data.contact_email or (user.email if user else None),
        delivery_city=data.delivery_city.strip(),
        delivery_address=data.delivery_address.strip(),
        comment=data.comment,
        request_key=data.request_key,
    )
    for line in quote.lines:
        v = line.variant
        # What the shop doesn't have is ordered from a supplier; the manager confirms the date.
        backordered = max(0, line.quantity - max(v.stock, 0))
        move_stock(
            db,
            v,
            -line.quantity,
            StockReason.online_order,
            order=order,
            user=user,
            allow_backorder=True,
        )
        order.items.append(
            OrderItem(
                variant_id=v.id,
                quantity=line.quantity,
                original_quantity=line.quantity,
                backordered=backordered,
                list_price=line.list_price,
                discount_percent=discount_percent(line.list_price, line.unit_price),
                price_applied=line.unit_price,
                promotion_id=line.deal.promotion_id if line.deal else None,
                promotion_title=line.deal.title if line.deal else None,
                price_tier=line.tier,
                brand_name=v.product.brand.name,
                product_name=v.product.name,
                product_id=v.product_id,
                volume_ml=v.volume_ml,
                is_tester=v.is_tester,
                cost_price=v.cost_price,
            )
        )
    # Backorders are the manager's business: the customer's history doesn't mention them.
    created = "Заказ оформлен на сайте" if user else "Заказ оформлен на сайте без регистрации"
    add_event(order, OrderEventKind.created, created, user)
    db.add(order)
    try:
        db.commit()
    except IntegrityError:
        # The same checkout sent twice at once: the other request placed it.
        db.rollback()
        again = placed_before(db, data.request_key, OrderChannel.online, buyer_id)
        if again is None:
            raise
        return _placed_out(db, again, user)
    if phone is not None:
        guest_orders.hit("all")
        guest_orders_per_phone.hit(phone)
    placed = _load_order(db, order.id)
    # The shop learns about it in Telegram, after the customer has the answer.
    if telegram.enabled():
        chat_ids = [r.chat_id for r in telegram.recipients(db)]
        if chat_ids:
            background.add_task(telegram.send_to_all, chat_ids, telegram.order_message(placed))
    # And the staff's phones, in the app (the owner may well be away from Telegram).
    if push.enabled():
        tokens = push.staff_tokens(db, exclude_user_id=placed.user_id)
        if tokens:
            background.add_task(
                push.send, tokens, *push.new_order(placed), {"admin_order_id": placed.id}
            )
    # And the customer by email.
    to = email.recipient(placed)
    if to and email.enabled():
        background.add_task(email.send_email, to, *email.order_placed(placed))
    return _placed_out(db, placed.id, user)


def _placed_out(db: Session, order_id: int, user: User | None) -> PlacedOrderOut:
    out = PlacedOrderOut.model_validate(_load_order(db, order_id))
    if user is None:
        out.guest_key = guest_key(order_id)
    return out


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


def _load_order(db: Session, order_id: int, *where, lock: bool = False) -> Order:
    stmt = select(Order).where(Order.id == order_id, *where)
    if lock:
        stmt = stmt.with_for_update(of=Order)
    order = db.scalar(stmt.options(*order_load_options()).execution_options(populate_existing=True))
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    return order


def _own_order(db: Session, order_id: int, user: User, lock: bool = False) -> Order:
    return _load_order(db, order_id, Order.user_id == user.id, lock=lock)


def _guest_order(db: Session, order_id: int, key: str, lock: bool = False) -> Order:
    """An order placed without an account, by the key from its link."""
    if not guest_key_is_good(order_id, key):
        raise HTTPException(404, "Заказ не найден")
    return _load_order(
        db, order_id, Order.user_id.is_(None), Order.channel == OrderChannel.online, lock=lock
    )


def _cancel(db: Session, order: Order, user: User | None) -> None:
    if order.status != OrderStatus.new:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Отменить можно только новый заказ — свяжитесь с менеджером"
        )
    change_status(db, order, OrderStatus.cancelled, user)
    db.commit()


@router.get("/orders/{order_id}", response_model=OrderOut)
def my_order(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _own_order(db, order_id, user)


@router.post("/orders/{order_id}/cancel", response_model=OrderOut)
def cancel_my_order(
    order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    _cancel(db, _own_order(db, order_id, user, lock=True), user)
    return _own_order(db, order_id, user)


# A guest's order: the key travels in a header, so it stays out of the server's access log.
@router.get("/orders/guest/{order_id}", response_model=OrderOut)
def guest_order(
    order_id: int,
    key: str = Header(default="", alias="X-Order-Key"),
    db: Session = Depends(get_db),
):
    return _guest_order(db, order_id, key)


@router.post("/orders/guest/{order_id}/cancel", response_model=OrderOut)
def cancel_guest_order(
    order_id: int,
    key: str = Header(default="", alias="X-Order-Key"),
    db: Session = Depends(get_db),
):
    _cancel(db, _guest_order(db, order_id, key, lock=True), None)
    return _guest_order(db, order_id, key)
