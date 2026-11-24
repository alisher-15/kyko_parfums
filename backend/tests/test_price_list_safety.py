"""A price list must not quietly read a price wrong or set a cost no one would believe."""

from decimal import Decimal

from app.models import PriceFormat, ProductVariant, SupplierPrice, UserRole, VariantBarcode
from app.services.price_lists import read_price_list_with_skips
from tests.test_suppliers import (  # noqa: F401
    _link,
    _priced,
    _state,
    _upload,
    _xlsx,
    kanat_file,
    suppliers,
)


def kanat_text_prices(items: list[tuple[str, object]]) -> bytes:
    """Канат's layout with the price cell as given (text, as some exports write it)."""
    return _xlsx(
        [
            [None, "Ценовая группа/ Номенклатура/ Характеристика номенклатуры", "Долларовая"],
            [None, "1. Элитка", None, None, "ОПТ,ЦЕНА"],
            *([None, text, None, "шт", price] for text, price in items),
        ]
    )


def test_prices_written_as_text_are_read():
    lines, skipped = read_price_list_with_skips(
        PriceFormat.usd_1c,
        kanat_text_prices(
            [
                ("A", "12 500 ₸"),
                ("B", "15.000"),
                ("C", "1 250,50 тг"),
                ("D", "по запросу, от 5 шт"),
                ("E", None),  # a heading: no price, nothing to say
            ]
        ),
        "p.xlsx",
    )
    assert [(x.text, x.price) for x in lines] == [
        ("A", Decimal("12500")),
        ("B", Decimal("15000")),
        ("C", Decimal("1250.50")),
    ]
    assert [(u.row, u.text, u.value) for u in skipped] == [(6, "D", "по запросу, от 5 шт")]


def test_the_report_lists_lines_whose_price_was_not_read(client, auth, suppliers):  # noqa: F811
    h = auth(UserRole.admin)
    content = kanat_text_prices([("A", 100), ("B", "звоните 8 700")])
    report = _upload(client, h, suppliers["kanat"], content)
    assert report["unreadable"] == [{"row": 4, "line": "B", "value": "звоните 8 700"}]


def test_a_cost_that_more_than_doubles_waits_for_the_owner(
    client,
    auth,
    catalog,
    db,
    suppliers,  # noqa: F811
):
    """A mistyped line (25 000 for 10 000) doesn't move the cost or the prices; it is listed."""
    h = auth(UserRole.admin)
    sauvage = catalog["sauvage100"]
    _priced(db, sauvage, "10000", "16000")
    kanat = suppliers["kanat"]

    _link(client, h, kanat, "DIOR SAUVAGE EDT 100", sauvage.id)
    report = _upload(client, h, kanat, kanat_file([("DIOR SAUVAGE EDT 100", 25000)]), apply=True)
    assert [(s["variant_id"], s["cost_new"]) for s in report["suspicious"]] == [(sauvage.id, 25000)]
    assert "больше чем вдвое" in report["suspicious"][0]["reason"]
    assert report["cost_up"] == report["prices_raised"] == 0
    assert _state(db, sauvage.id)[:2] == (10000, 16000)
    # The supplier's price is kept: it is what the list says.
    assert db.query(SupplierPrice).one().price == 25000
    # A believable rise goes through.
    _upload(client, h, kanat, kanat_file([("DIOR SAUVAGE EDT 100", 11000)]), apply=True)
    assert _state(db, sauvage.id)[:2] == (11000, 17600)


def test_a_first_cost_far_from_the_retail_price_is_not_remembered(
    client,
    auth,
    catalog,
    db,
    suppliers,  # noqa: F811
):
    """A volume with no cost yet gets 13.86 ₸ from a misread line: no markup of 216 000 %."""
    h = auth(UserRole.admin)
    sauvage = catalog["sauvage100"]
    sauvage.retail_price = Decimal("30000")
    sauvage.wholesale_price = sauvage.bulk_price = None
    db.commit()

    _link(client, h, suppliers["kanat"], "SAUVAGE", sauvage.id)
    report = _upload(client, h, suppliers["kanat"], kanat_file([("SAUVAGE", 13.86)]), apply=True)
    assert "меньше пятой части" in report["suspicious"][0]["reason"]
    assert report["remembered"] == 0
    db.expire_all()
    v = db.get(ProductVariant, sauvage.id)
    assert (v.cost_price, v.retail_markup) == (None, None)


def test_a_tester_line_is_the_tester_not_the_bottle(client, auth, catalog, db, suppliers):  # noqa: F811
    """Эрик's tester line («ПРИМ» TEST) has the bottle's barcode: it prices the tester."""
    h = auth(UserRole.admin)
    bottle = catalog["sauvage100"]
    tester = ProductVariant(
        product_id=bottle.product_id, volume_ml=100, is_tester=True, retail_price=Decimal(70)
    )
    db.add_all([tester, VariantBarcode(variant_id=bottle.id, code="3348901250146")])
    db.commit()
    content = _xlsx(
        [
            [None, "ШТРИХ - КОД", None, "ПРИМ", "ОПТ"],
            [None, "3348901250146", "DIOR SAUVAGE EDT 100", None, 60],
            [None, "3348901250146", "DIOR SAUVAGE EDT 100 TESTER", "TEST", 45],
        ]
    )
    _upload(client, h, suppliers["kanat"], kanat_file([("Other", 1)]), apply=True)
    report = _upload(client, h, suppliers["erik"], content, apply=True)
    assert report["matched"] == 2 and report["duplicates"] == 0
    prices = {sp.variant_id: sp.price for sp in db.query(SupplierPrice).all()}
    assert prices == {bottle.id: 60, tester.id: 45}
