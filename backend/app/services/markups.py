"""Markups remembered per volume.

Prices are set by hand: in the admin panel or by an Excel import of the four numbers (cost,
retail, wholesale, bulk). Each volume then remembers its markup on the cost for every price
level, ``markup = (price / cost − 1) × 100``, so that a later cost can be priced the same way.
"""

from decimal import ROUND_HALF_UP, Decimal

from app.models import ProductVariant

PERCENT = Decimal("0.0001")
# A price 100 000 times the cost is a typo in the cost, not a markup.
MAX_RATIO = 100_000


def markup_of(price: Decimal | None, cost: Decimal | None) -> Decimal | None:
    """Percent the price adds to the cost; None when either is unknown."""
    if price is None or cost is None or price <= 0 or cost <= 0 or price / cost >= MAX_RATIO:
        return None
    return ((price / cost - 1) * 100).quantize(PERCENT, rounding=ROUND_HALF_UP)


def remember(variant: ProductVariant) -> None:
    """Remember the markups of the variant's prices and cost as they are now."""
    variant.retail_markup = markup_of(variant.retail_price, variant.cost_price)
    variant.wholesale_markup = markup_of(variant.wholesale_price, variant.cost_price)
    variant.bulk_markup = markup_of(variant.bulk_price, variant.cost_price)
