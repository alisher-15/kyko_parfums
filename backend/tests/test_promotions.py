"""Promotions (banners with a discount off the retail price) and «Новинки» on the home page."""

from datetime import timedelta
from decimal import Decimal

import pytest

from app.models import OrderItem, UserRole
from app.pricing import promo_price
from app.services.promotions import shop_today
from tests.test_orders import CHECKOUT


@pytest.fixture
def today(db):
    return shop_today(db)


def promotion(client, headers, **fields):
    body = {"title": "Осенняя распродажа", **fields}
    for key in ("starts_on", "ends_on"):
        if key in body and body[key] is not None:
            body[key] = body[key].isoformat()
    r = client.post("/api/admin/promotions", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_promo_price_is_a_whole_number():
    assert promo_price(Decimal("84000.00"), Decimal("15")) == Decimal("71400")
    assert promo_price(Decimal("90.00"), Decimal("15")) == Decimal("77")  # 76.5 rounds up


def test_admin_manages_promotions(client, auth, catalog, today):
    h = auth(UserRole.admin)
    r = client.post(
        "/api/admin/promotions", json={"title": "Скидка", "discount_percent": 10}, headers=h
    )
    assert r.status_code == 422
    assert "весь каталог, бренды или товары" in r.text
    r = client.post(
        "/api/admin/promotions",
        json={
            "title": "Даты",
            "starts_on": today.isoformat(),
            "ends_on": (today - timedelta(days=1)).isoformat(),
        },
        headers=h,
    )
    assert r.status_code == 422
    r = client.post(
        "/api/admin/promotions",
        json={"title": "Проценты", "discount_percent": 100, "all_products": True},
        headers=h,
    )
    assert r.status_code == 422

    banner = promotion(client, h, title="Новая коллекция")  # a banner only
    chanel = promotion(
        client,
        h,
        discount_percent=10,
        brand_ids=[catalog["chanel"].id],
        product_ids=[catalog["sauvage"].id],
        ends_on=today,
    )
    assert chanel["status"] == "running"
    assert [b["name"] for b in chanel["brands"]] == ["Chanel"]
    assert [p["name"] for p in chanel["products"]] == ["Sauvage"]
    later = promotion(client, h, title="Зима", starts_on=today + timedelta(days=5))
    assert later["status"] == "scheduled"
    ended = promotion(client, h, title="Лето", ends_on=today - timedelta(days=1))
    assert ended["status"] == "ended"
    off = promotion(client, h, title="Выключена", is_active=False)
    assert off["status"] == "off"

    listed = client.get("/api/admin/promotions", headers=h).json()
    assert [p["id"] for p in listed] == [
        off["id"],
        ended["id"],
        later["id"],
        chanel["id"],
        banner["id"],
    ]
    assert (listed[3]["brands_count"], listed[3]["products_count"]) == (1, 1)

    # Only running promotions reach the home page.
    public = client.get("/api/promotions").json()
    assert [p["title"] for p in public] == ["Осенняя распродажа", "Новая коллекция"]
    assert client.get(f"/api/promotions/{later['id']}").status_code == 404

    # The whole catalog replaces the lists.
    body = {
        "title": "Всё",
        "discount_percent": 5,
        "all_products": True,
        "brand_ids": [catalog["dior"].id],
    }
    r = client.put(f"/api/admin/promotions/{chanel['id']}", json=body, headers=h)
    assert r.status_code == 200, r.text
    assert (r.json()["title"], r.json()["brands"], r.json()["all_products"]) == ("Всё", [], True)

    assert client.delete(f"/api/admin/promotions/{banner['id']}", headers=h).status_code == 204
    assert client.get(f"/api/admin/promotions/{banner['id']}", headers=h).status_code == 404
    assert client.get("/api/admin/promotions").status_code in (401, 403)


def test_catalog_shows_the_promotion_price(client, auth, catalog, today):
    h = auth(UserRole.admin)
    coco = catalog["coco"]
    brand = promotion(
        client, h, title="Chanel −10%", discount_percent=10, brand_ids=[catalog["chanel"].id]
    )
    best = promotion(
        client, h, title="Coco −20%", discount_percent=20, product_ids=[coco.id], ends_on=today
    )

    guest = client.get(f"/api/products/{coco.id}").json()
    # coco 50 ml: retail 100 → 80; 100 ml: 150 → 120. The best discount wins, they don't add up.
    assert [(v["price"], v["retail_price"]) for v in guest["variants"]] == [(80, 100), (120, 150)]
    assert guest["variants"][0]["deal"] == {
        "promotion_id": best["id"],
        "title": "Coco −20%",
        "discount_percent": 20.0,
        "ends_on": today.isoformat(),
    }
    assert guest["deal"]["discount_percent"] == 20.0
    assert guest["min_price"] == 80

    # Wholesale pays the lower price: 80 (wholesale) vs 80 (promotion) → no deal; 120 vs 120.
    wholesale = client.get(f"/api/products/{coco.id}", headers=auth(UserRole.wholesale)).json()
    assert [(v["price"], v["deal"]) for v in wholesale["variants"]] == [(80, None), (120, None)]
    assert wholesale["deal"] is None

    # Sorting, price filters and the «Акции» filter use the promotion price.
    listed = client.get("/api/products", params={"sort": "price_asc"}).json()["items"]
    assert [(p["name"], p["min_price"]) for p in listed[:2]] == [
        ("Coco Mademoiselle", 80),
        ("Sauvage", 90),
    ]
    assert listed[0]["deal"]["title"] == "Coco −20%"
    assert client.get("/api/products", params={"max_price": 85}).json()["total"] == 1
    on_sale = client.get("/api/products", params={"on_sale": True}).json()
    assert [p["name"] for p in on_sale["items"]] == ["Coco Mademoiselle"]
    in_brand = client.get("/api/products", params={"promotion_id": brand["id"]}).json()
    assert [p["name"] for p in in_brand["items"]] == ["Coco Mademoiselle"]
    assert client.get("/api/filters").json()["price_min"] == 80

    # Switched off: prices are back.
    body = {
        "title": "Coco −20%",
        "discount_percent": 20,
        "product_ids": [coco.id],
        "is_active": False,
    }
    client.put(f"/api/admin/promotions/{best['id']}", json=body, headers=h)
    guest = client.get(f"/api/products/{coco.id}").json()
    assert [v["price"] for v in guest["variants"]] == [90, 135]  # the brand's 10% is left


def test_cart_and_order_keep_the_promotion(client, auth, catalog, db):
    h = auth(UserRole.admin)
    coco50 = catalog["coco50"]
    promotion(client, h, title="Coco −20%", discount_percent=20, product_ids=[catalog["coco"].id])
    buyer = auth()
    items = [
        {"variant_id": coco50.id, "quantity": 2},
        {"variant_id": catalog["sauvage100"].id, "quantity": 1},
    ]

    quote = client.post("/api/cart/quote", json={"items": items}, headers=buyer).json()
    assert [(ln["unit_price"], ln["promotion_title"]) for ln in quote["lines"]] == [
        (80, "Coco −20%"),
        (90, None),
    ]
    assert (quote["total"], quote["retail_total"], quote["savings"]) == (250, 290, 40)

    order = client.post("/api/orders", json={**CHECKOUT, "items": items}, headers=buyer).json()
    assert order["total_amount"] == 250
    assert order["discount_total"] == 40
    line = order["items"][0]
    assert (line["list_price"], line["price_applied"], line["discount_percent"]) == (100, 80, 20)
    assert line["promotion_title"] == "Coco −20%"

    # Deleting the promotion keeps the order as it was sold.
    promo_id = db.get(OrderItem, line["id"]).promotion_id
    client.delete(f"/api/admin/promotions/{promo_id}", headers=h)
    again = client.get(f"/api/orders/{order['id']}", headers=buyer).json()
    assert (again["items"][0]["price_applied"], again["items"][0]["promotion_title"]) == (
        80,
        "Coco −20%",
    )


def test_till_applies_the_promotion_or_the_cashiers_discount(client, auth, catalog):
    h = auth(UserRole.admin)
    promotion(client, h, title="Coco −20%", discount_percent=20, product_ids=[catalog["coco"].id])
    coco50 = catalog["coco50"]

    def quote(discount):
        body = {"items": [{"variant_id": coco50.id, "quantity": 1, "discount_percent": discount}]}
        return client.post("/api/admin/store/quote", json=body, headers=h).json()["lines"][0]

    line = quote(0)
    assert (line["unit_price"], line["promotion_title"]) == (80, "Coco −20%")
    # The cashier's 5% is less than the promotion: the promotion stays, they don't add up.
    assert (quote(5)["unit_price"], quote(5)["promotion_title"]) == (80, "Coco −20%")

    sale = client.post(
        "/api/admin/store/sales",
        json={"items": [{"variant_id": coco50.id, "quantity": 1, "discount_percent": 5}]},
        headers=h,
    ).json()
    item = sale["items"][0]
    assert (item["list_price"], item["price_applied"], item["discount_percent"]) == (100, 80, 20)
    assert item["promotion_title"] == "Coco −20%"


def test_admin_marks_new_arrivals(client, auth, catalog):
    h = auth(UserRole.admin)
    coco, sauvage = catalog["coco"], catalog["sauvage"]

    # Nothing marked: «Новинки» sorts by the date added.
    assert client.get("/api/products", params={"is_new": True}).json()["total"] == 0

    r = client.patch(f"/api/admin/products/{sauvage.id}", json={"is_new": True}, headers=h)
    assert r.json()["is_new"] is True
    marked_at = r.json()["new_at"]
    client.patch(f"/api/admin/products/{coco.id}", json={"is_new": True}, headers=h)
    # Saving the product again keeps the date it was marked.
    r = client.patch(
        f"/api/admin/products/{sauvage.id}", json={"is_new": True, "name": "Sauvage"}, headers=h
    )
    assert r.json()["new_at"] == marked_at

    new = client.get("/api/products", params={"is_new": True, "sort": "new"}).json()
    assert [(p["name"], p["is_new"]) for p in new["items"]] == [
        ("Coco Mademoiselle", True),
        ("Sauvage", True),
    ]
    # Marked first, then the rest.
    everything = client.get("/api/products", params={"sort": "new"}).json()["items"]
    assert [p["name"] for p in everything][:2] == ["Coco Mademoiselle", "Sauvage"]
    admin_list = client.get("/api/admin/products", params={"is_new": True}, headers=h).json()
    assert admin_list["total"] == 2

    r = client.patch(f"/api/admin/products/{coco.id}", json={"is_new": False}, headers=h)
    assert (r.json()["is_new"], r.json()["new_at"]) == (False, None)
    assert client.get("/api/products", params={"is_new": True}).json()["total"] == 1
