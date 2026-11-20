"""Who of the shop's staff may do what in the admin panel.

The owner (``admin``) may do everything. A cashier works the till and the orders; the warehouse
receives goods, counts stock and picks orders. Products, prices and costs, suppliers,
promotions, users, settings and the figures stay the owner's. The menu has the same table
(frontend/src/lib/staff.ts); the API is what enforces it.
"""

from enum import StrEnum

from fastapi import Depends, HTTPException, Request, status

from app.deps import get_current_user
from app.models import User, UserRole


class Area(StrEnum):
    # «Продажа в магазине»: the till, the customers for a receipt.
    till = "till"
    # «Заказы и продажи»: statuses, picking, edits and returns.
    orders = "orders"
    # «Приёмка», «Инвентаризация», barcodes.
    stock = "stock"


ACCESS: dict[UserRole, frozenset[Area]] = {
    UserRole.cashier: frozenset({Area.till, Area.orders}),
    UserRole.warehouse: frozenset({Area.stock, Area.orders}),
}
STAFF = frozenset({UserRole.admin, *ACCESS})


def may(role: UserRole, area: Area) -> bool:
    return role == UserRole.admin or area in ACCESS.get(role, frozenset())


def require_staff(user: User = Depends(get_current_user)) -> User:
    if user.role not in STAFF:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Доступ только для сотрудников магазина")
    return user


def allow(*areas: Area, reading: tuple[Area, ...] = ()):
    """A dependency: the user works in one of ``areas``, or only reads (GET) for ``reading``.
    With no areas at all, only the owner."""

    def check(request: Request, user: User = Depends(require_staff)) -> User:
        granted = areas + (reading if request.method in ("GET", "HEAD") else ())
        if not any(may(user.role, a) for a in granted) and user.role != UserRole.admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этому разделу")
        return user

    return check
