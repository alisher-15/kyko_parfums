from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db import get_db
from app.models import Order, OrderItem, OrderStatus, User
from app.schemas.admin import AdminOrderBrief, AdminOrderOut, OrderStatusUpdate
from app.schemas.common import Page
from app.services.orders import change_status

router = APIRouter()


def _load_order(db: Session, order_id: int, lock: bool = False) -> Order:
    stmt = select(Order).where(Order.id == order_id)
    if lock:
        stmt = stmt.with_for_update(of=Order)
    order = db.scalar(stmt.options(selectinload(Order.items), joinedload(Order.user)))
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    return order


def _out(order: Order) -> AdminOrderOut:
    return AdminOrderOut.model_validate(order)


@router.get("/orders", response_model=Page[AdminOrderBrief])
def list_orders(
    q: str | None = Query(default=None, max_length=200),
    status: OrderStatus | None = None,
    user_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    conds = []
    if status is not None:
        conds.append(Order.status == status)
    if user_id is not None:
        conds.append(Order.user_id == user_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        conds.append(
            or_(
                cast(Order.id, String) == q.strip().lstrip("#"),
                User.email.ilike(like),
                Order.contact_name.ilike(like),
                Order.contact_phone.ilike(like),
            )
        )
    base = select(Order.id).join(User, User.id == Order.user_id).where(*conds)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    items_count = (
        select(func.coalesce(func.sum(OrderItem.quantity), 0))
        .where(OrderItem.order_id == Order.id)
        .scalar_subquery()
    )
    rows = db.execute(
        select(Order, User.email, items_count)
        .join(User, User.id == Order.user_id)
        .where(*conds)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [
        AdminOrderBrief(
            id=o.id,
            status=o.status,
            total_amount=o.total_amount,
            customer_role=o.customer_role,
            contact_name=o.contact_name,
            contact_phone=o.contact_phone,
            user_email=email,
            items_count=cnt,
            created_at=o.created_at,
        )
        for o, email, cnt in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/orders/{order_id}", response_model=AdminOrderOut)
def get_order(order_id: int, db: Session = Depends(get_db)):
    return _out(_load_order(db, order_id))


@router.patch("/orders/{order_id}", response_model=AdminOrderOut)
def update_order(order_id: int, data: OrderStatusUpdate, db: Session = Depends(get_db)):
    order = _load_order(db, order_id, lock=True)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("status") is not None:
        change_status(db, order, changes["status"])
    if "admin_note" in changes:
        order.admin_note = changes["admin_note"]
    db.commit()
    return _out(_load_order(db, order_id))
