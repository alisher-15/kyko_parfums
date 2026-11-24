"""The home page's lists: «Хиты продаж», «Тестеры», «Ниша и люкс», «Вы смотрели»."""

from decimal import Decimal

from app.models import ProductVariant, UserRole
from tests.test_orders import CHECKOUT


def _items(client, headers=None, **query):
    r = client.get("/api/products", params=query, headers=headers or {})
    assert r.status_code == 200, r.text
    return r.json()["items"]


def test_popular_counts_units_sold_and_skips_cancelled(client, catalog, auth):
    h = auth(UserRole.admin)
    sauvage, coco = catalog["sauvage100"], catalog["coco50"]
    order = lambda variant, qty: client.post(  # noqa: E731
        "/api/orders", json={**CHECKOUT, "items": [{"variant_id": variant.id, "quantity": qty}]}
    ).json()
    order(sauvage, 3)
    order(coco, 1)
    cancelled = order(coco, 5)
    r = client.patch(
        f"/api/admin/orders/{cancelled['id']}", json={"status": "cancelled"}, headers=h
    )
    assert r.status_code == 200, r.text

    items = _items(client, sort="popular")
    assert [(i["name"], i["sold"]) for i in items[:2]] == [("Sauvage", 3), ("Coco Mademoiselle", 1)]
    # Products nobody bought yet come after, with 0; other sorts don't say.
    assert items[-1]["sold"] == 0
    assert all(i["sold"] is None for i in _items(client))


def test_tester_offer_at_the_viewers_prices_and_filter(client, catalog, auth, db):
    coco = catalog["coco"]
    db.add(
        ProductVariant(
            product_id=coco.id,
            volume_ml=100,
            is_tester=True,
            retail_price=Decimal("110.00"),
            wholesale_price=Decimal("100.00"),
        )
    )
    # A tester without its bottle's volume has nothing to compare with.
    db.add(
        ProductVariant(
            product_id=catalog["sauvage"].id,
            volume_ml=30,
            is_tester=True,
            retail_price=Decimal("40.00"),
        )
    )
    db.commit()

    items = _items(client, tester=True)
    assert [i["name"] for i in items] == ["Coco Mademoiselle"]
    assert items[0]["tester"] == {"volume_ml": 100, "price": 110, "bottle_price": 150}
    wholesale = _items(client, auth(UserRole.wholesale), tester=True)
    assert wholesale[0]["tester"] == {"volume_ml": 100, "price": 100, "bottle_price": 120}
    assert next(i for i in _items(client) if i["name"] == "Sauvage")["tester"] is None


def test_top_brands_and_products_by_id(client, catalog, db):
    catalog["chanel"].is_top = True
    catalog["dior"].is_top = False
    db.commit()
    assert {i["brand"]["name"] for i in _items(client, top=True)} == {"Chanel"}

    ids = [catalog["sauvage"].id, catalog["coco"].id, catalog["hidden"].id]
    assert {i["id"] for i in _items(client, id=ids)} == set(ids[:2])  # hidden stays hidden
