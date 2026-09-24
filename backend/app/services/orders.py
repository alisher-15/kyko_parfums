from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.config import get_settings
from app.models import (
    Order,
    OrderEvent,
    OrderEventKind,
    OrderItem,
    OrderReturn,
    OrderReturnItem,
    OrderStatus,
    PaymentMethod,
    Product,
    ProductVariant,
    StockReason,
    User,
)
from app.services.stock import lock_variants, move_stock

# Allowed status transitions. Cancelled and delivered are final.
TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.new: {OrderStatus.processing, OrderStatus.shipped, OrderStatus.cancelled},
    OrderStatus.processing: {OrderStatus.new, OrderStatus.shipped, OrderStatus.cancelled},
    OrderStatus.shipped: {OrderStatus.processing, OrderStatus.delivered, OrderStatus.cancelled},
    OrderStatus.delivered: set(),
    OrderStatus.cancelled: set(),
}

STATUS_LABELS = {
    OrderStatus.new: "Новый",
    OrderStatus.processing: "В обработке",
    OrderStatus.shipped: "Отправлен",
    OrderStatus.delivered: "Доставлен",
    OrderStatus.cancelled: "Отменён",
}


def load_sellable_variants(
    db: Session, variant_ids: Iterable[int], lock: bool = False
) -> dict[int, ProductVariant]:
    """Active variants of active products, keyed by id.

    With ``lock=True`` the variant rows are locked (``FOR UPDATE``) in id order so that
    concurrent checkouts cannot oversell stock.
    """
    ids = sorted(set(variant_ids))
    if not ids:
        return {}
    stmt = (
        select(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(ProductVariant.id.in_(ids), ProductVariant.is_active, Product.is_active)
        .order_by(ProductVariant.id)
    )
    if lock:
        stmt = stmt.with_for_update(of=ProductVariant)
    return {v.id: v for v in db.scalars(stmt)}


def order_load_options():
    """Eager-load everything an order page shows (items, returns, history).

    Use with ``.execution_options(populate_existing=True)`` after a commit in the same session,
    so rows created in this request get their database defaults (ids, timestamps).
    """
    return (
        selectinload(Order.items).selectinload(OrderItem.return_items),
        selectinload(Order.returns)
        .selectinload(OrderReturn.items)
        .joinedload(OrderReturnItem.order_item),
        selectinload(Order.events),
        joinedload(Order.user),
        joinedload(Order.created_by),
    )


def add_event(order: Order, kind: OrderEventKind, message: str, user: User | None = None) -> None:
    order.events.append(OrderEvent(kind=kind, message=message, user_id=user.id if user else None))


def fmt_money(amount: Decimal) -> str:
    whole = f"{amount:,.2f}".replace(",", " ").removesuffix(".00")
    return f"{whole} {get_settings().currency_sign}"


def _label(item: OrderItem) -> str:
    return f"{item.product_name}, {item.volume_ml} мл"


def allowed_transitions(order: Order) -> set[OrderStatus]:
    return set(TRANSITIONS[order.status])


def change_status(
    db: Session, order: Order, new_status: OrderStatus, user: User | None = None
) -> None:
    if new_status == order.status:
        return
    if new_status not in allowed_transitions(order):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Нельзя сменить статус «{STATUS_LABELS[order.status]}» "
            f"на «{STATUS_LABELS[new_status]}»",
        )
    if new_status == OrderStatus.cancelled:
        restock(db, order, user)
    add_event(
        order,
        OrderEventKind.status,
        f"Статус: {STATUS_LABELS[order.status]} → {STATUS_LABELS[new_status]}",
        user,
    )
    order.status = new_status


def restock(db: Session, order: Order, user: User | None = None) -> None:
    variants = lock_variants(db, (i.variant_id for i in order.items))
    for item in order.items:
        v = variants.get(item.variant_id)
        if v is not None:
            move_stock(db, v, item.quantity, StockReason.order_cancel, order=order, user=user)


EDITABLE = {OrderStatus.new, OrderStatus.processing}


def edit_items(
    db: Session, order: Order, quantities: dict[int, int], reason: str | None, user: User
) -> None:
    """Reduce quantities / remove lines of an order that hasn't been shipped yet.

    Prices of the remaining lines stay as they were at checkout.
    """
    if order.status not in EDITABLE:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Состав можно менять только у нового заказа или в обработке"
        )
    by_id = {i.id: i for i in order.items}
    unknown = set(quantities) - set(by_id)
    if unknown:
        raise HTTPException(422, "Позиция не относится к этому заказу")
    for item_id, qty in quantities.items():
        if qty < 0 or qty > by_id[item_id].quantity:
            raise HTTPException(
                422,
                f"{_label(by_id[item_id])}: количество можно только уменьшить "
                f"(сейчас {by_id[item_id].quantity})",
            )
    if all(quantities.get(i.id, i.quantity) == 0 for i in order.items):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Нельзя убрать все позиции — отмените заказ целиком"
        )

    changed = [by_id[i] for i, q in quantities.items() if q != by_id[i].quantity]
    if not changed:
        return
    variants = lock_variants(db, (i.variant_id for i in changed))
    parts = []
    for item in changed:
        new_qty = quantities[item.id]
        removed = item.quantity - new_qty
        v = variants.get(item.variant_id)
        if v is not None:
            move_stock(db, v, removed, StockReason.order_edit, order=order, user=user, note=reason)
        parts.append(
            f"{_label(item)} — убрано"
            if new_qty == 0
            else f"{_label(item)}: {item.quantity} → {new_qty}"
        )
        item.quantity = new_qty
    order.total_amount = sum((i.price_applied * i.quantity for i in order.items), Decimal(0))
    message = (
        "Менеджер изменил состав: "
        + "; ".join(parts)
        + f". Новая сумма: {fmt_money(order.total_amount)}"
    )
    if reason:
        message += f". Причина: {reason}"
    add_event(order, OrderEventKind.edited, message, user)


@dataclass
class ReturnLine:
    order_item_id: int
    quantity: int
    restock: bool = True


def create_return(
    db: Session,
    order: Order,
    lines: list[ReturnLine],
    refund_method: PaymentMethod | None,
    reason: str | None,
    user: User,
) -> OrderReturn:
    """Register goods brought back after the order was handed over (partial or full)."""
    if order.status != OrderStatus.delivered:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Возврат оформляется по выданному заказу. Невыданный заказ можно изменить или отменить",
        )
    by_id = {i.id: i for i in order.items}
    for ln in lines:
        item = by_id.get(ln.order_item_id)
        if item is None:
            raise HTTPException(422, "Позиция не относится к этому заказу")
        left = item.quantity - item.returned_quantity
        if ln.quantity > left:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"{_label(item)}: можно вернуть не больше {left} шт.",
            )
        if ln.restock and item.variant_id is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"{_label(item)}: товар удалён из каталога — отметьте его как брак",
            )

    ret = OrderReturn(
        order=order,
        refund_method=refund_method,
        reason=reason,
        created_by_id=user.id,
        refund_amount=Decimal(0),
    )
    # SQLAlchemy 2 doesn't cascade via the many-to-one backref: add it explicitly.
    db.add(ret)
    variants = lock_variants(db, (by_id[ln.order_item_id].variant_id for ln in lines if ln.restock))
    parts = []
    for ln in lines:
        item = by_id[ln.order_item_id]
        amount = item.price_applied * ln.quantity
        ret.items.append(
            OrderReturnItem(
                order_item=item, quantity=ln.quantity, restock=ln.restock, amount=amount
            )
        )
        ret.refund_amount += amount
        if ln.restock:
            move_stock(
                db,
                variants[item.variant_id],
                ln.quantity,
                StockReason.order_return,
                order=order,
                user=user,
                note=reason,
            )
        parts.append(f"{_label(item)} × {ln.quantity}" + ("" if ln.restock else " (брак, списано)"))

    message = f"Возврат на {fmt_money(ret.refund_amount)}: " + "; ".join(parts)
    if reason:
        message += f". Причина: {reason}"
    add_event(order, OrderEventKind.returned, message, user)
    return ret
