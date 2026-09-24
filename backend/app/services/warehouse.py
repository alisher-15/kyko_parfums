"""Posting stock receipts (приёмка) and stock counts (инвентаризация)."""

from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    DocumentStatus,
    Order,
    OrderItem,
    OrderStatus,
    StockCount,
    StockReason,
    StockReceipt,
    User,
)
from app.services.stock import lock_variants, move_stock, set_stock

CENT = Decimal("0.01")
# Orders whose goods have not left the shop: shipped and delivered ones are gone.
OPEN_ORDER_STATUSES = (OrderStatus.new, OrderStatus.processing)


def average_cost(
    stock_before: int, cost_before: Decimal | None, quantity: int, cost: Decimal | None
) -> Decimal | None:
    """Moving average cost of the units in stock after receiving `quantity` at `cost`.

    Units already in stock with an unknown cost are assumed to cost the same as the new ones.
    """
    if cost is None:
        return cost_before
    if cost_before is None or stock_before <= 0:
        return cost
    total = cost_before * stock_before + cost * quantity
    return (total / (stock_before + quantity)).quantize(CENT, ROUND_HALF_UP)


def receipt_note(receipt: StockReceipt) -> str:
    parts = [f"Приёмка №{receipt.id}"]
    if receipt.supplier:
        parts.append(receipt.supplier)
    if receipt.number:
        parts.append(f"накл. {receipt.number}")
    return " · ".join(parts)[:255]


def post_receipt(db: Session, receipt: StockReceipt, user: User) -> None:
    """Add the goods to stock and update average costs. The caller checks it is a draft."""
    variants = lock_variants(db, (i.variant_id for i in receipt.items))
    note = receipt_note(receipt)
    for item in receipt.items:
        variant = variants[item.variant_id]
        variant.cost_price = average_cost(
            variant.stock, variant.cost_price, item.quantity, item.cost_price
        )
        move_stock(
            db, variant, item.quantity, StockReason.receipt, user=user, receipt=receipt, note=note
        )
    receipt.status = DocumentStatus.posted
    receipt.posted_at = datetime.now(UTC)
    receipt.posted_by = user


def reserved(db: Session, variant_ids: Iterable[int | None]) -> dict[int, int]:
    """Units promised to orders that have not left the shop (new or in processing).

    Checkout already took them from `stock`, but they are still on the shelf, or owed to the
    customer when the order was a backorder.
    """
    ids = {i for i in variant_ids if i is not None}
    if not ids:
        return {}
    rows = db.execute(
        select(OrderItem.variant_id, func.sum(OrderItem.quantity))
        .join(Order, Order.id == OrderItem.order_id)
        .where(OrderItem.variant_id.in_(ids), Order.status.in_(OPEN_ORDER_STATUSES))
        .group_by(OrderItem.variant_id)
    )
    return {variant_id: int(quantity) for variant_id, quantity in rows}


def post_count(db: Session, count: StockCount, user: User) -> None:
    """Set the stock of every counted volume from what is physically there.

    The count includes goods set aside for orders that have not been shipped, and those are
    not for sale: stock = counted - reserved. Below zero, the rest is owed to customers.
    """
    variants = lock_variants(db, (i.variant_id for i in count.items))
    held = reserved(db, variants)
    note = f"Инвентаризация №{count.id}"
    for item in count.items:
        variant = variants[item.variant_id]
        in_orders = held.get(variant.id, 0)
        item.expected = variant.stock + in_orders
        set_stock(
            db,
            variant,
            item.counted - in_orders,
            StockReason.inventory,
            user=user,
            count=count,
            note=f"{note} · в заказах {in_orders} шт." if in_orders else note,
            allow_backorder=True,
        )
    count.status = DocumentStatus.posted
    count.posted_at = datetime.now(UTC)
    count.posted_by = user
