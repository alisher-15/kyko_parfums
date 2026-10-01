"""Prices from the cost by markup groups.

    price = cost × (1 + markup of the brand's group / 100)

rounded up to whole hundreds of tenge, for each price level (retail, wholesale, bulk). A markup
is on the cost: 30% of 10 000 ₸ gives 13 000 ₸. Every brand is in one group (``price_groups``);
a brand without a group is in the default one, so a new brand needs nothing.

Prices stay stored on the variants. Changing a group's markups or moving brands to another group
rewrites the prices of the brands concerned at once; the admin sees beforehand how many prices
change (a dry run of the same plan). A receipt that moves the average cost doesn't move prices by
itself: «Пересчитать» does that, checked first and then applied. Volumes marked «Цена вручную»
(``price_locked``) and volumes without a cost are left alone.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import ROUND_CEILING, Decimal
from typing import Any

from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, contains_eager

from app.models import Brand, PriceGroup, Product, ProductVariant

PRICE_STEP = Decimal(100)
DEFAULT_GROUP = ("Базовая", 60, 30, 20)

Prices = tuple[Decimal, Decimal | None, Decimal | None]


@dataclass(frozen=True)
class Markups:
    """Percent on the cost for each price level."""

    retail: int
    wholesale: int
    bulk: int


def group_markups(group: PriceGroup) -> Markups:
    return Markups(group.retail_markup, group.wholesale_markup, group.bulk_markup)


def order_error(m: Markups) -> str | None:
    """Wholesale must not cost more than retail, nor bulk more than wholesale."""
    if m.wholesale > m.retail:
        return f"Наценка опта ({m.wholesale}%) не может быть выше розничной ({m.retail}%)"
    if m.bulk > m.wholesale:
        return f"Наценка крупного опта ({m.bulk}%) не может быть выше оптовой ({m.wholesale}%)"
    return None


def default_group(db: Session) -> PriceGroup:
    """The group of brands without one (created by the migration; recreated if missing)."""
    group = db.scalar(select(PriceGroup).where(PriceGroup.is_default))
    if group is None:
        name, retail, wholesale, bulk = DEFAULT_GROUP
        db.add(
            PriceGroup(
                name=name,
                retail_markup=retail,
                wholesale_markup=wholesale,
                bulk_markup=bulk,
                is_default=True,
            )
        )
        try:
            db.commit()
        except IntegrityError:  # created by a parallel request
            db.rollback()
        group = db.scalars(select(PriceGroup).where(PriceGroup.is_default)).one()
    return group


def in_group(group: PriceGroup) -> ColumnElement[bool]:
    """Brands of the group: for the default one, also the brands without a group."""
    if group.is_default:
        return or_(Brand.price_group_id.is_(None), Brand.price_group_id == group.id)
    return Brand.price_group_id == group.id


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
    db: Session,
    where: Sequence[Any] = (),
    *,
    markups: Mapping[int, Markups] | None = None,
    brand_groups: Mapping[int, int | None] | None = None,
    lock: bool = False,
) -> Plan:
    """New prices of the volumes matching ``where`` (conditions on the variant, product or brand).

    What-ifs for a check before saving: ``markups`` replaces the markups of some groups (by group
    id), ``brand_groups`` puts some brands in other groups (brand id -> group id, None = the
    default group). ``lock``: the prices are going to be written, lock the volumes until commit.
    """
    default_id = default_group(db).id
    rules = {g.id: group_markups(g) for g in db.scalars(select(PriceGroup))}
    rules.update(markups or {})
    moves = brand_groups or {}
    stmt = (
        select(ProductVariant)
        .join(ProductVariant.product)
        .join(Product.brand)
        .options(contains_eager(ProductVariant.product).contains_eager(Product.brand))
        .where(*where)
        .order_by(ProductVariant.id)
    )
    if lock:
        stmt = stmt.with_for_update(of=ProductVariant)
    plan = Plan()
    for v in db.scalars(stmt):
        if v.price_locked:
            plan.locked += 1
            continue
        if not v.cost_price:
            plan.no_cost += 1
            continue
        brand = v.product.brand
        group_id = moves[brand.id] if brand.id in moves else brand.price_group_id
        old = (v.retail_price, v.wholesale_price, v.bulk_price)
        new = prices_from_cost(v.cost_price, rules[group_id or default_id])
        if new == old:
            plan.unchanged += 1
        else:
            plan.changes.append(Change(v, old, new))
    return plan


def apply(plan: Plan) -> None:
    """Write the planned prices; the caller commits."""
    for c in plan.changes:
        c.variant.retail_price, c.variant.wholesale_price, c.variant.bulk_price = c.new
