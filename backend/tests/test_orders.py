from decimal import Decimal

from app.models import Order, PricingMode, PricingSettings, ProductVariant, UserRole
from app.services.orders import guest_key

CHECKOUT = {
    "contact_name": "Анна",
    "contact_phone": "+7 700 123 45 67",
    "delivery_city": "Алматы",
    "delivery_address": "ул. Абая, 1",
}


def set_pricing(db, **kwargs):
    s = db.get(PricingSettings, 1)
    for k, v in kwargs.items():
        setattr(s, k, v)
    db.commit()


def test_quote_guest_is_retail(client, catalog):
    r = client.post(
        "/api/cart/quote",
        json={"items": [{"variant_id": catalog["coco50"].id, "quantity": 2}]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 200
    assert body["price_tier"] == "retail"
    assert body["can_checkout"] is True


def test_quote_reports_unavailable_and_out_of_stock(client, catalog):
    hidden_variant_id = 99999
    r = client.post(
        "/api/cart/quote",
        json={
            "items": [
                {"variant_id": catalog["sauvage100"].id, "quantity": 1},  # stock 0
                {"variant_id": hidden_variant_id, "quantity": 1},
            ]
        },
    ).json()
    assert r["unavailable_variant_ids"] == [hidden_variant_id]
    # A volume that is no longer sold blocks checkout; one that is out of stock doesn't.
    assert r["can_checkout"] is False
    only_out = {"items": [{"variant_id": catalog["sauvage100"].id, "quantity": 1}]}
    assert client.post("/api/cart/quote", json=only_out).json()["can_checkout"] is True


def test_quote_wholesale_threshold(client, catalog, auth, db):
    set_pricing(db, wholesale_min_order_amount=Decimal("500"))
    headers = auth(UserRole.wholesale)
    item = {"variant_id": catalog["coco50"].id}

    body = client.post(
        "/api/cart/quote", json={"items": [{**item, "quantity": 5}]}, headers=headers
    ).json()
    assert body["price_tier"] == "retail"
    assert body["total"] == 500
    assert body["hints"] == [
        {"tier": "wholesale", "missing_amount": 100, "variant_id": None, "missing_qty": None}
    ]

    body = client.post(
        "/api/cart/quote", json={"items": [{**item, "quantity": 7}]}, headers=headers
    ).json()
    assert body["price_tier"] == "wholesale"
    assert body["total"] == 560
    assert body["savings"] == 140


def test_quote_item_quantity_mode(client, catalog, auth, db):
    set_pricing(db, mode=PricingMode.item_quantity, wholesale_min_item_qty=3, bulk_min_item_qty=6)
    body = client.post(
        "/api/cart/quote",
        json={
            "items": [
                {"variant_id": catalog["coco50"].id, "quantity": 6},
                {"variant_id": catalog["coco100"].id, "quantity": 1},
            ]
        },
        headers=auth(UserRole.bulk_wholesale),
    ).json()
    tiers = {line["volume_ml"]: line["price_tier"] for line in body["lines"]}
    assert tiers == {50: "bulk", 100: "retail"}
    assert body["total"] == 6 * 70 + 150
    assert body["price_tier"] is None


def test_guest_checkout_at_retail_prices_with_own_link(client, catalog, auth, db):
    items = [{"variant_id": catalog["coco50"].id, "quantity": 2}]
    r = client.post("/api/orders", json={**CHECKOUT, "items": items})
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["total_amount"] == 200  # retail: 100 × 2
    assert order["items"][0]["price_tier"] == "retail"
    key = order["guest_key"]
    assert key and len(key) == 24
    db.refresh(catalog["coco50"])
    assert catalog["coco50"].stock == 8
    placed = db.get(Order, order["id"])
    assert placed.user_id is None and placed.customer_role == UserRole.retail
    assert placed.events[0].message == "Заказ оформлен на сайте без регистрации"

    # The link /orders/{id}?key=… opens it; the key goes in a header.
    path = f"/api/orders/guest/{order['id']}"
    seen = client.get(path, headers={"X-Order-Key": key})
    assert seen.status_code == 200 and seen.json()["status"] == "new"
    assert client.get(path).status_code == 404
    assert client.get(path, headers={"X-Order-Key": key[:-1] + "A"}).status_code == 404
    other = client.post("/api/orders", json={**CHECKOUT, "items": items}).json()
    assert client.get(path, headers={"X-Order-Key": other["guest_key"]}).status_code == 404

    # The guest cancels it like a customer with an account; the stock comes back.
    r = client.post(f"{path}/cancel", headers={"X-Order-Key": key})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    db.refresh(catalog["coco50"])
    assert catalog["coco50"].stock == 8  # 10 − 2 − 2 (the other order) + 2
    assert client.post(f"{path}/cancel", headers={"X-Order-Key": key}).status_code == 409


def test_guest_links_open_only_guest_orders(client, catalog, auth):
    items = [{"variant_id": catalog["coco50"].id, "quantity": 1}]
    mine = client.post("/api/orders", json={**CHECKOUT, "items": items}, headers=auth()).json()
    assert mine["guest_key"] is None
    path = f"/api/orders/guest/{mine['id']}"
    assert client.get(path, headers={"X-Order-Key": guest_key(mine["id"])}).status_code == 404


def test_guest_needs_a_whole_phone_and_is_limited(client, catalog, auth):
    items = [{"variant_id": catalog["coco50"].id, "quantity": 1}]
    r = client.post("/api/orders", json={**CHECKOUT, "contact_phone": "123", "items": items})
    assert r.status_code == 422
    assert "телефон полностью" in r.json()["detail"]

    for _ in range(3):
        assert client.post("/api/orders", json={**CHECKOUT, "items": items}).status_code == 201
    # The same number a fourth time within an hour, however it is written.
    same = {**CHECKOUT, "contact_phone": "+7 (700) 123-45-67", "items": items}
    r = client.post("/api/orders", json=same)
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) > 0
    # Another number may order; a customer with an account is never limited.
    other = {**CHECKOUT, "contact_phone": "+7 701 000 00 00", "items": items}
    assert client.post("/api/orders", json=other).status_code == 201
    with_account = client.post("/api/orders", json={**CHECKOUT, "items": items}, headers=auth())
    assert with_account.status_code == 201


def test_checkout_creates_order_and_decrements_stock(client, catalog, auth, db):
    headers = auth(UserRole.wholesale)
    r = client.post(
        "/api/orders",
        json={
            **CHECKOUT,
            "items": [
                {"variant_id": catalog["coco50"].id, "quantity": 3},
                {"variant_id": catalog["coco100"].id, "quantity": 2},
            ],
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["status"] == "new"
    assert order["customer_role"] == "wholesale"
    assert order["total_amount"] == 3 * 80 + 2 * 120  # threshold 0 -> wholesale
    assert {i["price_tier"] for i in order["items"]} == {"wholesale"}
    assert order["items"][0]["brand_name"] == "Chanel"
    assert order["contact_email"].endswith("@example.com")

    db.expire_all()
    assert db.get(ProductVariant, catalog["coco50"].id).stock == 7
    assert db.get(ProductVariant, catalog["coco100"].id).stock == 0

    orders = client.get("/api/orders", headers=headers).json()
    assert orders["total"] == 1
    assert orders["items"][0]["items_count"] == 5


def test_checkout_beyond_stock_is_a_backorder(client, catalog, auth, db):
    """The shop can usually get missing goods in 1-2 days: the order goes through."""
    headers = auth()
    item = {"variant_id": catalog["coco100"].id, "quantity": 3}  # 2 in stock
    quote = client.post("/api/cart/quote", json={"items": [item]}, headers=headers).json()
    assert quote["can_checkout"] is True

    r = client.post("/api/orders", json={**CHECKOUT, "items": [item]}, headers=headers)
    assert r.status_code == 201, r.text
    order = r.json()
    # The customer is told nothing about it; the manager sees the missing unit.
    assert "backordered" not in order["items"][0]
    assert order["events"][0]["message"] == "Заказ оформлен на сайте"
    admin_view = client.get(f"/api/admin/orders/{order['id']}", headers=auth(UserRole.admin))
    assert admin_view.json()["items"][0]["backordered"] == 1
    db.expire_all()
    # Below zero: one unit is owed to the customer.
    assert db.get(ProductVariant, catalog["coco100"].id).stock == -1

    # The storefront shows nothing about it.
    v100 = client.get(f"/api/products/{catalog['coco'].id}").json()["variants"][1]
    assert v100["stock"] is None

    # Cancelling gives everything back.
    client.post(f"/api/orders/{order['id']}/cancel", headers=headers)
    db.expire_all()
    assert db.get(ProductVariant, catalog["coco100"].id).stock == 2


def test_manager_removes_what_is_missing(client, catalog, auth, db):
    headers = auth()
    item = {"variant_id": catalog["coco100"].id, "quantity": 5}  # 2 in stock, 3 backordered
    order = client.post("/api/orders", json={**CHECKOUT, "items": [item]}, headers=headers).json()
    admin = auth(UserRole.admin)
    view = client.get(f"/api/admin/orders/{order['id']}", headers=admin).json()
    assert view["variant_stock"] == {str(catalog["coco100"].id): -3}
    listed = client.get("/api/admin/orders", headers=admin).json()["items"][0]
    assert listed["has_backorder"] is True

    # Keep the 2 that are here, drop the 3 that aren't.
    r = client.patch(
        f"/api/admin/orders/{order['id']}/items",
        json={"items": [{"order_item_id": order["items"][0]["id"], "quantity": 2}]},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    assert r.json()["variant_stock"] == {str(catalog["coco100"].id): 0}
    db.expire_all()
    assert db.get(ProductVariant, catalog["coco100"].id).stock == 0


def test_quote_does_not_reveal_stock(client, catalog, auth):
    item = [{"variant_id": catalog["coco50"].id, "quantity": 11}]  # 10 in stock
    for headers in (auth(), auth(UserRole.wholesale)):
        quote = client.post("/api/cart/quote", json={"items": item}, headers=headers).json()
        assert quote["can_checkout"] is True
        assert not {"stock", "available"} & quote["lines"][0].keys()


def test_checkout_rejects_duplicate_and_hidden_variants(client, catalog, auth, db):
    headers = auth()
    vid = catalog["coco50"].id
    r = client.post(
        "/api/orders",
        json={**CHECKOUT, "items": [{"variant_id": vid, "quantity": 1}] * 2},
        headers=headers,
    )
    assert r.status_code == 422

    catalog["coco"].is_active = False
    db.commit()
    r = client.post(
        "/api/orders",
        json={**CHECKOUT, "items": [{"variant_id": vid, "quantity": 1}]},
        headers=headers,
    )
    assert r.status_code == 409


def test_cancel_own_new_order_restocks(client, catalog, auth, db):
    headers = auth()
    order = client.post(
        "/api/orders",
        json={**CHECKOUT, "items": [{"variant_id": catalog["coco50"].id, "quantity": 4}]},
        headers=headers,
    ).json()
    r = client.post(f"/api/orders/{order['id']}/cancel", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"
    db.expire_all()
    assert db.get(ProductVariant, catalog["coco50"].id).stock == 10

    r = client.post(f"/api/orders/{order['id']}/cancel", headers=headers)
    assert r.status_code == 409


def test_orders_are_private(client, catalog, auth):
    owner = auth()
    order = client.post(
        "/api/orders",
        json={**CHECKOUT, "items": [{"variant_id": catalog["coco50"].id, "quantity": 1}]},
        headers=owner,
    ).json()
    other = auth()
    assert client.get(f"/api/orders/{order['id']}", headers=other).status_code == 404
    assert client.post(f"/api/orders/{order['id']}/cancel", headers=other).status_code == 404
    assert client.get("/api/orders", headers=other).json()["total"] == 0
