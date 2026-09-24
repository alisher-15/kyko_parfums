"""Role-based pricing and wholesale thresholds.

Every variant has three prices (retail / wholesale / bulk). A user's role caps the best tier
they may get:

    guest, retail, admin  -> retail
    wholesale             -> wholesale
    bulk_wholesale        -> bulk

Whether the capped tier actually applies depends on the thresholds in ``PricingSettings``:

* ``order_total``   — the tier is picked once for the whole order: the best allowed tier whose
                      order total (computed at that tier's prices) reaches the tier minimum.
* ``item_quantity`` — the tier is picked per order line: the best allowed tier whose minimum
                      quantity of that variant is reached.

If no threshold is reached the line falls back to retail, so a wholesale customer can always
check out; the quote tells them how much is missing to unlock the better price.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from decimal import Decimal

from app.models import PriceTier, PricingMode, PricingSettings, ProductVariant, UserRole

TIER_RANK = {PriceTier.retail: 0, PriceTier.wholesale: 1, PriceTier.bulk: 2}
ZERO = Decimal("0")


def max_tier_for_role(role: UserRole | None) -> PriceTier:
    if role == UserRole.bulk_wholesale:
        return PriceTier.bulk
    if role == UserRole.wholesale:
        return PriceTier.wholesale
    return PriceTier.retail


def visible_tiers(role: UserRole | None) -> list[PriceTier]:
    """Which price columns the user is allowed to see in the catalog."""
    if role == UserRole.admin:
        return list(PriceTier)
    top = TIER_RANK[max_tier_for_role(role)]
    return [t for t in PriceTier if TIER_RANK[t] <= top]


ROLE_RANK = {
    UserRole.retail: 0,
    UserRole.wholesale: 1,
    UserRole.bulk_wholesale: 2,
}


def next_role(role: UserRole | None) -> UserRole | None:
    """The price level a customer can ask to be upgraded to (None: nothing above / not a buyer)."""
    return {UserRole.retail: UserRole.wholesale, UserRole.wholesale: UserRole.bulk_wholesale}.get(
        role  # type: ignore[arg-type]
    )


def teaser_tier(role: UserRole | None, settings: PricingSettings) -> PriceTier | None:
    """Tier whose price is shown to the customer as "your next price" (upsell), if any.

    Only wholesale customers get a teaser (the bulk price). Retail customers and guests never
    see trade prices: resellers' end customers would see their purchase price.
    """
    if role == UserRole.wholesale and settings.show_next_tier:
        return PriceTier.bulk
    return None


def price_for_tier(variant: ProductVariant, tier: PriceTier) -> Decimal:
    """Unit price for a tier, falling back to the next tier when a price is not set."""
    if tier == PriceTier.bulk and variant.bulk_price is not None:
        return variant.bulk_price
    if tier in (PriceTier.bulk, PriceTier.wholesale) and variant.wholesale_price is not None:
        return variant.wholesale_price
    return variant.retail_price


def _tiers_desc(max_tier: PriceTier) -> list[PriceTier]:
    """Non-retail tiers from best to worst, up to ``max_tier``."""
    return [t for t in (PriceTier.bulk, PriceTier.wholesale) if TIER_RANK[t] <= TIER_RANK[max_tier]]


def min_amount(settings: PricingSettings, tier: PriceTier) -> Decimal:
    if tier == PriceTier.bulk:
        return Decimal(settings.bulk_min_order_amount)
    if tier == PriceTier.wholesale:
        return Decimal(settings.wholesale_min_order_amount)
    return ZERO


def min_qty(settings: PricingSettings, tier: PriceTier) -> int:
    if tier == PriceTier.bulk:
        return settings.bulk_min_item_qty
    if tier == PriceTier.wholesale:
        return settings.wholesale_min_item_qty
    return 1


@dataclass
class QuoteItem:
    variant: ProductVariant
    quantity: int


@dataclass
class QuoteLine:
    variant: ProductVariant
    quantity: int
    tier: PriceTier
    unit_price: Decimal
    retail_unit_price: Decimal

    @property
    def line_total(self) -> Decimal:
        return self.unit_price * self.quantity


@dataclass
class TierHint:
    """What is missing to unlock a better tier."""

    tier: PriceTier
    missing_amount: Decimal | None = None  # order_total mode
    variant_id: int | None = None  # item_quantity mode
    missing_qty: int | None = None  # item_quantity mode


@dataclass
class Quote:
    mode: PricingMode
    lines: list[QuoteLine]
    hints: list[TierHint] = field(default_factory=list)

    @property
    def total(self) -> Decimal:
        return sum((line.line_total for line in self.lines), ZERO)

    @property
    def retail_total(self) -> Decimal:
        return sum((line.retail_unit_price * line.quantity for line in self.lines), ZERO)

    @property
    def tier(self) -> PriceTier | None:
        """Common tier of all lines, or None if the lines were priced differently."""
        tiers = {line.tier for line in self.lines}
        return tiers.pop() if len(tiers) == 1 else None


def build_quote(
    items: Sequence[QuoteItem], role: UserRole | None, settings: PricingSettings
) -> Quote:
    candidates = _tiers_desc(max_tier_for_role(role))
    mode = PricingMode(settings.mode)

    if mode == PricingMode.order_total:
        return _quote_by_order_total(items, candidates, settings)
    return _quote_by_item_quantity(items, candidates, settings)


def _line(item: QuoteItem, tier: PriceTier) -> QuoteLine:
    return QuoteLine(
        variant=item.variant,
        quantity=item.quantity,
        tier=tier,
        unit_price=price_for_tier(item.variant, tier),
        retail_unit_price=item.variant.retail_price,
    )


def _quote_by_order_total(
    items: Sequence[QuoteItem], candidates: list[PriceTier], settings: PricingSettings
) -> Quote:
    totals = {
        t: sum((price_for_tier(i.variant, t) * i.quantity for i in items), ZERO) for t in candidates
    }
    applied = PriceTier.retail
    for t in candidates:  # best first
        if items and totals[t] >= min_amount(settings, t):
            applied = t
            break

    hints = [
        TierHint(tier=t, missing_amount=min_amount(settings, t) - totals[t])
        for t in reversed(candidates)  # nearest better tier first
        if TIER_RANK[t] > TIER_RANK[applied] and totals[t] < min_amount(settings, t)
    ]
    return Quote(
        mode=PricingMode.order_total,
        lines=[_line(i, applied) for i in items],
        hints=hints,
    )


def _quote_by_item_quantity(
    items: Sequence[QuoteItem], candidates: list[PriceTier], settings: PricingSettings
) -> Quote:
    lines: list[QuoteLine] = []
    hints: list[TierHint] = []
    for item in items:
        applied = next(
            (t for t in candidates if item.quantity >= min_qty(settings, t)), PriceTier.retail
        )
        lines.append(_line(item, applied))
        better = [
            t
            for t in reversed(candidates)
            if TIER_RANK[t] > TIER_RANK[applied]
            and price_for_tier(item.variant, t) < lines[-1].unit_price
        ]
        if better:
            nxt = better[0]
            hints.append(
                TierHint(
                    tier=nxt,
                    variant_id=item.variant.id,
                    missing_qty=min_qty(settings, nxt) - item.quantity,
                )
            )
    return Quote(mode=PricingMode.item_quantity, lines=lines, hints=hints)
