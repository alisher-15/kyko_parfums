from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Order, OrderStatus, Product, ProductVariant

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


def change_status(db: Session, order: Order, new_status: OrderStatus) -> None:
    if new_status == order.status:
        return
    if new_status not in TRANSITIONS[order.status]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Нельзя сменить статус «{STATUS_LABELS[order.status]}» "
            f"на «{STATUS_LABELS[new_status]}»",
        )
    if new_status == OrderStatus.cancelled:
        restock(db, order)
    order.status = new_status


def restock(db: Session, order: Order) -> None:
    ids = [i.variant_id for i in order.items if i.variant_id is not None]
    if not ids:
        return
    variants = {
        v.id: v
        for v in db.scalars(
            select(ProductVariant)
            .where(ProductVariant.id.in_(ids))
            .order_by(ProductVariant.id)
            .with_for_update()
        )
    }
    for item in order.items:
        v = variants.get(item.variant_id)
        if v is not None:
            v.stock += item.quantity
