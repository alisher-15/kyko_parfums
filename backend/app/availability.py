"""What customers learn about stock (pure functions, like pricing.py).

Exact counts are business data: a competitor could track sales by them. Guests and retail
buyers see a level, and the count only when few units are left ("осталось 2 шт."). Wholesale
partners and admins, who order in bulk, see the count.
"""

from enum import StrEnum

from app.models import UserRole

# At or below this, the storefront says "few left" and shows the count to everyone.
LOW_STOCK = 5

EXACT_STOCK_ROLES = frozenset({UserRole.wholesale, UserRole.bulk_wholesale, UserRole.admin})


class Availability(StrEnum):
    in_stock = "in_stock"
    low = "low"
    out = "out"


def availability(stock: int) -> Availability:
    if stock <= 0:
        return Availability.out
    if stock <= LOW_STOCK:
        return Availability.low
    return Availability.in_stock


def visible_stock(stock: int, role: UserRole | None) -> int | None:
    """The stock count this viewer may see; None when it is hidden."""
    if role in EXACT_STOCK_ROLES or stock <= LOW_STOCK:
        return max(stock, 0)
    return None
