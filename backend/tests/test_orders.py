from decimal import Decimal

from app.models import PricingMode, PricingSettings, ProductVariant, UserRole

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
    assert r["lines"][0]["available"] is False
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


def test_checkout_requires_auth(client, catalog):
    r = client.post(
        "/api/orders",
        json={**CHECKOUT, "items": [{"variant_id": catalog["coco50"].id, "quantity": 1}]},
    )
    assert r.status_code == 401


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
    assert (quote["lines"][0]["available"], quote["can_checkout"]) == (False, True)

    r = client.post("/api/orders", json={**CHECKOUT, "items": [item]}, headers=headers)
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["items"][0]["backordered"] == 1
    assert "Под заказ" in order["events"][0]["message"]
    assert "Coco Mademoiselle, 100 мл — 1 шт." in order["events"][0]["message"]
    db.expire_all()
    # Below zero: one unit is owed to the customer.
    assert db.get(ProductVariant, catalog["coco100"].id).stock == -1

    # Out of stock for everyone now; the count is 0, not a negative number.
    v100 = client.get(f"/api/products/{catalog['coco'].id}").json()["variants"][1]
    assert (v100["availability"], v100["stock"]) == ("out", 0)

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


def test_quote_and_checkout_do_not_reveal_large_stock(client, catalog, auth):
    item = [{"variant_id": catalog["coco50"].id, "quantity": 11}]  # 10 in stock
    retail, wholesale = auth(), auth(UserRole.wholesale)

    def quoted(headers):
        line = client.post("/api/cart/quote", json={"items": item}, headers=headers).json()
        return line["lines"][0]["available"], line["lines"][0]["stock"]

    assert quoted(retail) == (False, None)
    assert quoted(wholesale) == (False, 10)


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
