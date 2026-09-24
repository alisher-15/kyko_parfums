"""Posting stock receipts (приёмка) and stock counts (инвентаризация)."""

from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.models import (
    DocumentStatus,
    StockCount,
    StockReason,
    StockReceipt,
    User,
)
from app.services.stock import lock_variants, move_stock, set_stock

CENT = Decimal("0.01")


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


def post_count(db: Session, count: StockCount, user: User) -> None:
    """Replace the stock of every counted volume with the counted quantity."""
    variants = lock_variants(db, (i.variant_id for i in count.items))
    note = f"Инвентаризация №{count.id}"
    for item in count.items:
        variant = variants[item.variant_id]
        item.expected = variant.stock
        set_stock(
            db, variant, item.counted, StockReason.inventory, user=user, count=count, note=note
        )
    count.status = DocumentStatus.posted
    count.posted_at = datetime.now(UTC)
    count.posted_by = user
