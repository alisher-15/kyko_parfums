from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Order, ProductVariant, StockMovement, StockReason, User


def move_stock(
    db: Session,
    variant: ProductVariant,
    delta: int,
    reason: StockReason,
    *,
    order: Order | None = None,
    user: User | None = None,
    note: str | None = None,
) -> None:
    """Change a variant's stock and write the change to the journal.

    Every stock change goes through here. The caller is responsible for locking the variant row
    (SELECT ... FOR UPDATE) when concurrent changes are possible, and for committing.
    """
    if delta == 0:
        return
    new_stock = (variant.stock or 0) + delta
    if new_stock < 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Недостаточно товара на складе: в наличии {variant.stock or 0} шт.",
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
) -> None:
    """Set an absolute stock value (admin edit, import) and journal the difference."""
    move_stock(db, variant, new_stock - (variant.stock or 0), reason, user=user, note=note)
