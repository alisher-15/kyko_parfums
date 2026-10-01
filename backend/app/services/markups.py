"""Prices from the cost by markups.

    price = cost × (1 + (base markup of the level + the brand's addition) / 100)

rounded up to whole hundreds of tenge. The base markup of each price level (retail, wholesale,
bulk) is in ``pricing_settings``, the brand's addition to each in ``brands``. A markup is on the
cost: 30% of 10 000 ₸ gives 13 000 ₸.

Prices stay stored on the variants: recalculating them is an admin action, checked first and then
applied, so a receipt that moves the average cost doesn't move prices by itself. Volumes marked
«Цена вручную» (``price_locked``) and volumes without a cost are left alone.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from decimal import ROUND_CEILING, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import Brand, PricingSettings, Product, ProductVariant

PRICE_STEP = Decimal(100)

Prices = tuple[Decimal, Decimal | None, Decimal | None]


@dataclass(frozen=True)
class Markups:
    """Percent on the cost for each price level."""

    retail: int
    wholesale: int
    bulk: int


def base_markups(settings: PricingSettings) -> Markups:
    return Markups(settings.retail_markup, settings.wholesale_markup, settings.bulk_markup)


def brand_markups(base: Markups, brand: Brand) -> Markups:
    return Markups(
        base.retail + brand.retail_markup,
        base.wholesale + brand.wholesale_markup,
        base.bulk + brand.bulk_markup,
    )


def order_error(m: Markups) -> str | None:
    """Wholesale must not cost more than retail, nor bulk more than wholesale."""
    if m.wholesale > m.retail:
        return f"наценка опта ({m.wholesale}%) выше розничной ({m.retail}%)"
    if m.bulk > m.wholesale:
        return f"наценка крупного опта ({m.bulk}%) выше оптовой ({m.wholesale}%)"
    return None


def brands_out_of_order(base: Markups, brands: Sequence[Brand]) -> list[str]:
    return [b.name for b in brands if order_error(brand_markups(base, b))]


def price_from_cost(cost: Decimal, markup: int) -> Decimal:
    price = cost * (100 + markup) / 100
    return (price / PRICE_STEP).to_integral_value(rounding=ROUND_CEILING) * PRICE_STEP


def prices_from_cost(cost: Decimal, m: Markups) -> Prices:
    return (
        price_from_cost(cost, m.retail),
        price_from_cost(cost, m.wholesale),
        price_from_cost(cost, m.bulk),
    )


@dataclass
class Change:
    variant: ProductVariant
    old: Prices
    new: Prices


@dataclass
class Plan:
    changes: list[Change] = field(default_factory=list)
    unchanged: int = 0
    locked: int = 0
    no_cost: int = 0


def plan_reprice(
    db: Session, settings: PricingSettings, brand_id: int | None = None, lock: bool = False
) -> Plan:
    """New prices of every volume (or of one brand's volumes) by the current markups.
    ``lock``: the prices are going to be written, lock the volumes until the commit."""
    stmt = (
        select(ProductVariant)
        .join(ProductVariant.product)
        .options(joinedload(ProductVariant.product).joinedload(Product.brand))
        .order_by(ProductVariant.id)
    )
    if brand_id is not None:
        stmt = stmt.where(Product.brand_id == brand_id)
    if lock:
        stmt = stmt.with_for_update(of=ProductVariant)
    base = base_markups(settings)
    plan = Plan()
    for v in db.scalars(stmt):
        if v.price_locked:
            plan.locked += 1
            continue
        if not v.cost_price:
            plan.no_cost += 1
            continue
        old = (v.retail_price, v.wholesale_price, v.bulk_price)
        new = prices_from_cost(v.cost_price, brand_markups(base, v.product.brand))
        if new == old:
            plan.unchanged += 1
        else:
            plan.changes.append(Change(v, old, new))
    return plan


def apply(plan: Plan) -> None:
    """Write the planned prices; the caller commits."""
    for c in plan.changes:
        c.variant.retail_price, c.variant.wholesale_price, c.variant.bulk_price = c.new
