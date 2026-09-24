from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import Order, User, UserRole
from app.pricing import ROLE_RANK
from app.schemas.admin import AdminUserCreate, AdminUserOut, AdminUserUpdate
from app.schemas.common import Page
from app.security import hash_password

router = APIRouter()


def _orders_count(db: Session, user_id: int) -> int:
    return db.scalar(select(func.count(Order.id)).where(Order.user_id == user_id)) or 0


def _out(user: User, orders_count: int) -> AdminUserOut:
    return AdminUserOut.model_validate(user).model_copy(update={"orders_count": orders_count})


@router.get("/users", response_model=Page[AdminUserOut])
def list_users(
    q: str | None = Query(default=None, max_length=200),
    role: UserRole | None = None,
    wholesale_requested: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    conds = []
    if q and q.strip():
        like = f"%{q.strip()}%"
        conds.append(
            or_(
                User.email.ilike(like),
                User.full_name.ilike(like),
                User.phone.ilike(like),
                User.company_name.ilike(like),
            )
        )
    if role is not None:
        conds.append(User.role == role)
    if wholesale_requested is not None:
        conds.append(User.wholesale_requested == wholesale_requested)

    total = db.scalar(select(func.count(User.id)).where(*conds)) or 0
    orders_count = select(func.count(Order.id)).where(Order.user_id == User.id).scalar_subquery()
    rows = db.execute(
        select(User, orders_count)
        .where(*conds)
        .order_by(User.wholesale_requested.desc(), User.created_at.desc(), User.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page(items=[_out(u, c) for u, c in rows], total=total, page=page, page_size=page_size)


@router.get("/users/{user_id}", response_model=AdminUserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    return _out(user, _orders_count(db, user_id))


@router.post("/users", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def create_user(data: AdminUserCreate, db: Session = Depends(get_db)):
    if db.scalar(select(User.id).where(User.email == data.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь с таким email уже существует")
    user = User(**data.model_dump(exclude={"password"}), password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return _out(user, 0)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    changes = data.model_dump(exclude_unset=True)
    if user.id == admin.id and (
        changes.get("role", UserRole.admin) != UserRole.admin or changes.get("is_active") is False
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Нельзя снять права администратора или заблокировать себя"
        )

    password = changes.pop("password", None)
    if password:
        user.password_hash = hash_password(password)
        user.token_version += 1
    new_role = changes.get("role")
    if (
        user.wholesale_requested
        and new_role in ROLE_RANK
        and ROLE_RANK[new_role] >= ROLE_RANK.get(user.requested_role, 1)
    ):
        # The upgrade request has been granted.
        changes["wholesale_requested"] = False
    if changes.get("wholesale_requested") is False:
        user.requested_role = None
        user.upgrade_request_note = None
    if changes.get("is_active") is False:
        user.token_version += 1  # revoke refresh tokens
    for k, v in changes.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return _out(user, _orders_count(db, user_id))


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Нельзя удалить самого себя")
    if _orders_count(db, user_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "У пользователя есть заказы — заблокируйте его вместо удаления",
        )
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
