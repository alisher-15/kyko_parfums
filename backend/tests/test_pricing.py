from decimal import Decimal

from app.models import PriceTier, PricingMode, PricingSettings, ProductVariant, UserRole
from app.pricing import QuoteItem, build_quote, price_for_tier, visible_tiers

D = Decimal


def variant(vid: int, retail, wholesale=None, bulk=None) -> ProductVariant:
    return ProductVariant(
        id=vid,
        volume_ml=50,
        retail_price=D(retail),
        wholesale_price=D(wholesale) if wholesale is not None else None,
        bulk_price=D(bulk) if bulk is not None else None,
    )


def settings(mode=PricingMode.order_total, wh_amount=0, bulk_amount=0, wh_qty=1, bulk_qty=1):
    return PricingSettings(
        id=1,
        mode=mode,
        wholesale_min_order_amount=D(wh_amount),
        bulk_min_order_amount=D(bulk_amount),
        wholesale_min_item_qty=wh_qty,
        bulk_min_item_qty=bulk_qty,
    )


def test_price_fallbacks():
    v = variant(1, 100, 80, None)
    assert price_for_tier(v, PriceTier.bulk) == D(80)
    v = variant(1, 100, None, None)
    assert price_for_tier(v, PriceTier.bulk) == D(100)
    assert price_for_tier(v, PriceTier.wholesale) == D(100)


def test_visible_tiers():
    assert visible_tiers(None) == [PriceTier.retail]
    assert visible_tiers(UserRole.retail) == [PriceTier.retail]
    assert visible_tiers(UserRole.wholesale) == [PriceTier.retail, PriceTier.wholesale]
    assert visible_tiers(UserRole.bulk_wholesale) == list(PriceTier)
    assert visible_tiers(UserRole.admin) == list(PriceTier)


def test_retail_role_never_gets_wholesale():
    q = build_quote([QuoteItem(variant(1, 100, 80, 70), 100)], UserRole.retail, settings())
    assert q.tier == PriceTier.retail
    assert q.total == D(10000)
    assert q.hints == []


def test_order_total_threshold_for_wholesale():
    s = settings(wh_amount=500, bulk_amount=2000)
    v = variant(1, 100, 80, 70)

    # 5 * 80 = 400 < 500 -> retail, and a hint about the missing 100.
    q = build_quote([QuoteItem(v, 5)], UserRole.wholesale, s)
    assert q.tier == PriceTier.retail
    assert q.total == D(500)
    assert [(h.tier, h.missing_amount) for h in q.hints] == [(PriceTier.wholesale, D(100))]

    # 7 * 80 = 560 >= 500 -> wholesale.
    q = build_quote([QuoteItem(v, 7)], UserRole.wholesale, s)
    assert q.tier == PriceTier.wholesale
    assert q.total == D(560)
    assert q.retail_total == D(700)
    assert q.hints == []  # a wholesale user is never offered bulk


def test_order_total_bulk_user_gets_best_reached_tier():
    s = settings(wh_amount=500, bulk_amount=2000)
    v = variant(1, 100, 80, 70)

    q = build_quote([QuoteItem(v, 10)], UserRole.bulk_wholesale, s)  # wh 800, bulk 700
    assert q.tier == PriceTier.wholesale
    assert [(h.tier, h.missing_amount) for h in q.hints] == [(PriceTier.bulk, D(1300))]

    q = build_quote([QuoteItem(v, 30)], UserRole.bulk_wholesale, s)  # bulk 2100
    assert q.tier == PriceTier.bulk
    assert q.total == D(2100)


def test_order_total_is_summed_over_all_lines():
    s = settings(wh_amount=300)
    items = [QuoteItem(variant(1, 100, 80), 2), QuoteItem(variant(2, 100, 90), 2)]  # 160 + 180
    q = build_quote(items, UserRole.wholesale, s)
    assert q.tier == PriceTier.wholesale
    assert q.total == D(340)


def test_item_quantity_mode_is_per_line():
    s = settings(mode=PricingMode.item_quantity, wh_qty=3, bulk_qty=10)
    a, b, c = variant(1, 100, 80, 70), variant(2, 50, 40, 30), variant(3, 20, 15, 10)
    q = build_quote(
        [QuoteItem(a, 2), QuoteItem(b, 3), QuoteItem(c, 12)], UserRole.bulk_wholesale, s
    )
    assert [line.tier for line in q.lines] == [
        PriceTier.retail,
        PriceTier.wholesale,
        PriceTier.bulk,
    ]
    assert q.tier is None  # mixed
    assert q.total == D(2 * 100 + 3 * 40 + 12 * 10)
    hints = {(h.variant_id, h.tier, h.missing_qty) for h in q.hints}
    assert hints == {(1, PriceTier.wholesale, 1), (2, PriceTier.bulk, 7)}


def test_item_quantity_mode_skips_hint_when_price_is_not_better():
    s = settings(mode=PricingMode.item_quantity, wh_qty=3, bulk_qty=10)
    v = variant(1, 100, 80, None)  # no bulk price -> bulk tier gives nothing
    q = build_quote([QuoteItem(v, 3)], UserRole.bulk_wholesale, s)
    assert q.lines[0].tier == PriceTier.wholesale
    assert q.hints == []


def test_empty_cart():
    q = build_quote([], UserRole.wholesale, settings(wh_amount=0))
    assert q.total == D(0)
    assert q.lines == []
