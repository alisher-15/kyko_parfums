"""The price history and the products list's price checks."""

from decimal import Decimal

from app.models import PriceChange, UserRole
from app.services import markups
from tests.test_admin import xlsx


def _history(client, h, product_id: int) -> list[tuple]:
    rows = client.get(f"/api/admin/products/{product_id}/price-history", headers=h).json()
    return [
        (r["volume_ml"], r["field"], r["old_value"], r["new_value"], r["source"], r["user_email"])
        for r in rows
    ]


def test_a_price_set_in_the_admin_panel_is_written_down(client, auth, db, catalog):
    h = auth(UserRole.admin)
    coco50 = catalog["coco50"]
    url = f"/api/admin/variants/{coco50.id}"
    r = client.patch(url, json={"retail_price": 110, "cost_price": 60}, headers=h)
    assert r.status_code == 200, r.text
    rows = _history(client, h, coco50.product_id)
    assert sorted(r[:5] for r in rows) == [
        (50, "cost", None, 60, "Админка"),
        (50, "retail", 100, 110, "Админка"),
    ]
    assert {r[5] for r in rows} == {"admin1@example.com"}
    # Saving the same numbers again changes nothing, and stock is not a price.
    client.patch(url, json={"retail_price": 110, "stock": 3}, headers=h)
    assert len(_history(client, h, coco50.product_id)) == 2
    # A new volume's first prices are not a change.
    assert db.query(PriceChange).filter(PriceChange.variant_id != coco50.id).count() == 0


def test_an_import_is_written_down(client, auth, catalog):
    h = auth(UserRole.admin)
    rows = [
        ["Бренд", "Название", "Тип", "Объём, мл", "Цена"],
        ["Chanel", "Coco Mademoiselle", "EDP", 50, 105],
    ]
    files = {"file": ("catalog.xlsx", xlsx(rows), "application/octet-stream")}
    assert client.post("/api/admin/import/catalog", files=files, headers=h).status_code == 200
    assert [r[:5] for r in _history(client, h, catalog["coco"].id)] == [
        (50, "retail", 100, 105, "Импорт Excel")
    ]


def _checked(client, h, check: str) -> list[str]:
    r = client.get("/api/admin/products", params={"price_check": check}, headers=h)
    return [p["name"] for p in r.json()["items"]]


def test_price_checks_find_losses_and_drifted_markups(client, auth, db, catalog):
    h = auth(UserRole.admin)
    for check in ("below_cost", "markup_down", "markup_up"):
        assert _checked(client, h, check) == []

    # Coco 50: sold under its cost.
    catalog["coco50"].cost_price = Decimal(120)
    # Sauvage: bought at 50, priced 90 (+80 %); then a receipt made the cost 60 (+50 %).
    sauvage = catalog["sauvage100"]
    sauvage.cost_price = Decimal(50)
    markups.remember(sauvage)
    db.commit()
    sauvage.cost_price = Decimal(60)
    # Coco 100: bought at 100, priced 150 (+50 %); now 80 (+87.5 %): the price could go down.
    coco100 = catalog["coco100"]
    coco100.cost_price = Decimal(100)
    markups.remember(coco100)
    db.commit()
    coco100.cost_price = Decimal(80)
    db.commit()

    assert _checked(client, h, "below_cost") == ["Coco Mademoiselle"]
    assert _checked(client, h, "markup_down") == ["Sauvage"]
    assert _checked(client, h, "markup_up") == ["Coco Mademoiselle"]
    # Within 5 points of the usual markup is not a drift.
    sauvage.cost_price = Decimal(51)  # +76.5 %, the usual 80 % less 3.5 points
    db.commit()
    assert _checked(client, h, "markup_down") == []
