from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Order,
    ProductVariant,
    StockCount,
    StockMovement,
    StockReason,
    StockReceipt,
    User,
)


def move_stock(
    db: Session,
    variant: ProductVariant,
    delta: int,
    reason: StockReason,
    *,
    order: Order | None = None,
    user: User | None = None,
    note: str | None = None,
    receipt: StockReceipt | None = None,
    count: StockCount | None = None,
    allow_backorder: bool = False,
) -> None:
    """Change a variant's stock and write the change to the journal.

    Every stock change goes through here. The caller is responsible for locking the variant row
    (SELECT ... FOR UPDATE) when concurrent changes are possible, and for committing.
    Stock goes below zero only with ``allow_backorder``: online orders may take more than the
    shop has, and the minus is what customers are owed.
    """
    if delta == 0:
        return
    new_stock = (variant.stock or 0) + delta
    if new_stock < 0 and not allow_backorder:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Недостаточно товара на складе: в наличии {max(variant.stock or 0, 0)} шт.",
        )
    variant.stock = new_stock
    db.add(
        StockMovement(
            variant=variant,
            delta=delta,
            stock_after=new_stock,
            reason=reason,
            order=order,
            user=user,
            note=note,
            receipt_id=receipt.id if receipt else None,
            count_id=count.id if count else None,
        )
    )


def set_stock(
    db: Session,
    variant: ProductVariant,
    new_stock: int,
    reason: StockReason,
    *,
    user: User | None = None,
    note: str | None = None,
    count: StockCount | None = None,
    allow_backorder: bool = False,
) -> None:
    """Set an absolute stock value (admin edit, import, stock count) and journal the difference."""
    move_stock(
        db,
        variant,
        new_stock - (variant.stock or 0),
        reason,
        user=user,
        note=note,
        count=count,
        allow_backorder=allow_backorder,
    )


def lock_variants(db: Session, variant_ids: Iterable[int | None]) -> dict[int, ProductVariant]:
    """SELECT ... FOR UPDATE in id order (no deadlocks), re-reading rows already in the session."""
    ids = sorted({i for i in variant_ids if i is not None})
    if not ids:
        return {}
    stmt = (
        select(ProductVariant)
        .where(ProductVariant.id.in_(ids))
        .order_by(ProductVariant.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return {v.id: v for v in db.scalars(stmt)}
