from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import Order, OrderChannel, OrderItem, OrderReturn, OrderStatus, User
from app.schemas.admin import (
    AdminOrderBrief,
    AdminOrderOut,
    OrderItemsEditIn,
    OrderStatusUpdate,
    ReturnIn,
)
from app.schemas.common import Page
from app.services.orders import (
    ReturnLine,
    change_status,
    create_return,
    edit_items,
    order_load_options,
)

router = APIRouter()


def _load_order(db: Session, order_id: int, lock: bool = False) -> Order:
    stmt = select(Order).where(Order.id == order_id)
    if lock:
        stmt = stmt.with_for_update(of=Order)
    order = db.scalar(stmt.options(*order_load_options()).execution_options(populate_existing=True))
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    return order


def _out(order: Order) -> AdminOrderOut:
    return AdminOrderOut.model_validate(order)


@router.get("/orders", response_model=Page[AdminOrderBrief])
def list_orders(
    q: str | None = Query(default=None, max_length=200),
    status: OrderStatus | None = None,
    channel: OrderChannel | None = None,
    user_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    conds = []
    if status is not None:
        conds.append(Order.status == status)
    if channel is not None:
        conds.append(Order.channel == channel)
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
    # Outer join: store sales may have no customer account.
    base = select(Order.id).outerjoin(User, User.id == Order.user_id).where(*conds)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

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
        select(Order, User.email, items_count, returned)
        .outerjoin(User, User.id == Order.user_id)
        .where(*conds)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [
        AdminOrderBrief(
            id=o.id,
            channel=o.channel,
            status=o.status,
            total_amount=o.total_amount,
            returned_amount=ret,
            customer_role=o.customer_role,
            payment_method=o.payment_method,
            contact_name=o.contact_name,
            contact_phone=o.contact_phone,
            user_email=email,
            items_count=cnt,
            created_at=o.created_at,
        )
        for o, email, cnt, ret in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/orders/{order_id}", response_model=AdminOrderOut)
def get_order(order_id: int, db: Session = Depends(get_db)):
    return _out(_load_order(db, order_id))


@router.patch("/orders/{order_id}", response_model=AdminOrderOut)
def update_order(
    order_id: int,
    data: OrderStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    order = _load_order(db, order_id, lock=True)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("status") is not None:
        change_status(db, order, changes["status"], admin)
    if "admin_note" in changes:
        order.admin_note = changes["admin_note"]
    db.commit()
    return _out(_load_order(db, order_id))


@router.patch("/orders/{order_id}/items", response_model=AdminOrderOut)
def edit_order_items(
    order_id: int,
    data: OrderItemsEditIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Remove lines / reduce quantities before the order is shipped. Freed stock goes back."""
    order = _load_order(db, order_id, lock=True)
    edit_items(db, order, {i.order_item_id: i.quantity for i in data.items}, data.reason, admin)
    db.commit()
    return _out(_load_order(db, order_id))


@router.post(
    "/orders/{order_id}/returns",
    response_model=AdminOrderOut,
    status_code=status.HTTP_201_CREATED,
)
def create_order_return(
    order_id: int,
    data: ReturnIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Partial or full return of a delivered order (store sale or website order)."""
    order = _load_order(db, order_id, lock=True)
    create_return(
        db,
        order,
        [ReturnLine(i.order_item_id, i.quantity, i.restock) for i in data.items],
        data.refund_method,
        data.reason,
        admin,
    )
    db.commit()
    return _out(_load_order(db, order_id))
