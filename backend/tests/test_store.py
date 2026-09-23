from decimal import Decimal

from app.models import PricingSettings, ProductVariant, StockMovement, UserRole
from tests.conftest import login, make_user
from tests.test_orders import CHECKOUT


def journal(db, variant_id: int) -> list[tuple[str, int, int]]:
    db.expire_all()
    rows = db.query(StockMovement).filter_by(variant_id=variant_id).order_by(StockMovement.id).all()
    return [(m.reason.value, m.delta, m.stock_after) for m in rows]


def stock(db, variant_id: int) -> int:
    db.expire_all()
    return db.get(ProductVariant, variant_id).stock


def test_store_endpoints_are_admin_only(client, auth):
    body = {"items": []}
    assert client.post("/api/admin/store/quote", json=body).status_code == 401
    assert (
        client.post(
            "/api/admin/store/quote", json=body, headers=auth(UserRole.wholesale)
        ).status_code
        == 403
    )


def test_variant_search_by_name_and_sku(client, auth, catalog, db):
    h = auth(UserRole.admin)
    catalog["coco100"].sku = "3145891165203"
    catalog["sauvage100"].sku = "SAUV-100"
    db.commit()

    r = client.get("/api/admin/store/variants", params={"q": "chanel coco"}, headers=h).json()
    assert [(i["product_name"], i["volume_ml"]) for i in r] == [
        ("Coco Mademoiselle", 50),
        ("Coco Mademoiselle", 100),
    ]
    # A scanned barcode is an exact SKU match and comes first.
    r = client.get("/api/admin/store/variants", params={"q": "3145891165203"}, headers=h).json()
    assert r[0]["variant_id"] == catalog["coco100"].id
    assert r[0]["wholesale_price"] == 120
    r = client.get("/api/admin/store/variants", params={"q": "sauv-1"}, headers=h).json()
    assert [i["sku"] for i in r] == ["SAUV-100"]


def test_anonymous_cash_sale_deducts_stock_and_is_journaled(client, auth, catalog, db):
    h = auth(UserRole.admin)
    vid = catalog["coco50"].id
    payload = {
        "items": [{"variant_id": vid, "quantity": 2, "discount_percent": 5}],
        "payment_method": "cash",
        "customer_name": "Гость магазина",
    }
    q = client.post("/api/admin/store/quote", json=payload, headers=h).json()
    assert q["price_tier"] == "retail"
    assert (q["subtotal"], q["discount_total"], q["total"]) == (200, 10, 190)
    assert q["can_submit"] is True

    r = client.post("/api/admin/store/sales", json=payload, headers=h)
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["channel"] == "store"
    assert order["status"] == "delivered"
    assert order["payment_method"] == "cash"
    assert order["user_id"] is None
    assert order["contact_name"] == "Гость магазина"
    assert order["total_amount"] == 190
    assert order["discount_total"] == 10
    assert order["created_by_email"].endswith("@example.com")
    item = order["items"][0]
    assert (item["list_price"], item["discount_percent"], item["price_applied"]) == (100, 5, 95)

    assert stock(db, vid) == 8
    assert journal(db, vid) == [("store_sale", -2, 8)]


def test_sale_to_known_customer_uses_their_tier(client, auth, catalog, db):
    h = auth(UserRole.admin)
    shop = make_user(db, "shop@example.com", UserRole.bulk_wholesale)
    items = [{"variant_id": catalog["coco100"].id, "quantity": 1}]

    q = client.post(
        "/api/admin/store/quote", json={"items": items, "customer_id": shop.id}, headers=h
    ).json()
    assert q["price_tier"] == "bulk"
    assert q["total"] == 120  # no bulk price -> wholesale fallback

    # The admin may override the tier.
    q = client.post(
        "/api/admin/store/quote",
        json={"items": items, "customer_id": shop.id, "price_tier": "retail"},
        headers=h,
    ).json()
    assert q["total"] == 150

    order = client.post(
        "/api/admin/store/sales",
        json={"items": items, "customer_id": shop.id, "payment_method": "transfer"},
        headers=h,
    ).json()
    assert order["user_id"] == shop.id
    assert order["customer_role"] == "bulk_wholesale"
    assert order["contact_email"] == "shop@example.com"

    # The sale shows up in the customer's own order history.
    mine = client.get("/api/orders", headers=login(client, "shop@example.com")).json()
    assert [(o["id"], o["channel"]) for o in mine["items"]] == [(order["id"], "store")]


def test_discount_limit_and_stock_are_enforced(client, auth, catalog, db):
    h = auth(UserRole.admin)
    vid = catalog["coco100"].id  # stock 2

    too_much = {"items": [{"variant_id": vid, "quantity": 1, "discount_percent": 15}]}
    q = client.post("/api/admin/store/quote", json=too_much, headers=h).json()
    assert q["can_submit"] is False
    assert "скидка" in q["errors"][0]
    assert client.post("/api/admin/store/sales", json=too_much, headers=h).status_code == 409

    # The limit is configurable.
    db.get(PricingSettings, 1).max_store_discount_percent = Decimal(20)
    db.commit()
    q = client.post("/api/admin/store/quote", json=too_much, headers=h).json()
    assert q["can_submit"] is True

    r = client.post(
        "/api/admin/store/sales",
        json={"items": [{"variant_id": vid, "quantity": 3}]},
        headers=h,
    )
    assert r.status_code == 409
    assert "только 2 шт." in r.json()["detail"]["message"]
    assert stock(db, vid) == 2
    assert journal(db, vid) == []


def test_store_sale_of_hidden_product_is_allowed(client, auth, catalog, db):
    """Goods can be sold in the shop even if they are not published on the website."""
    h = auth(UserRole.admin)
    catalog["coco"].is_active = False
    db.commit()
    r = client.post(
        "/api/admin/store/sales",
        json={"items": [{"variant_id": catalog["coco50"].id, "quantity": 1}]},
        headers=h,
    )
    assert r.status_code == 201


def test_store_sale_return_restocks(client, auth, catalog, db):
    h = auth(UserRole.admin)
    vid = catalog["coco50"].id
    order = client.post(
        "/api/admin/store/sales",
        json={"items": [{"variant_id": vid, "quantity": 3}]},
        headers=h,
    ).json()
    r = client.patch(f"/api/admin/orders/{order['id']}", json={"status": "cancelled"}, headers=h)
    assert r.status_code == 200, r.text
    assert stock(db, vid) == 10
    assert journal(db, vid) == [("store_sale", -3, 7), ("order_cancel", 3, 10)]
    # A returned sale is final.
    assert (
        client.patch(
            f"/api/admin/orders/{order['id']}", json={"status": "new"}, headers=h
        ).status_code
        == 409
    )


def test_orders_list_filters_by_channel(client, auth, catalog):
    h = auth(UserRole.admin)
    client.post(
        "/api/orders",
        json={**CHECKOUT, "items": [{"variant_id": catalog["coco50"].id, "quantity": 1}]},
        headers=auth(),
    )
    client.post(
        "/api/admin/store/sales",
        json={
            "items": [{"variant_id": catalog["coco50"].id, "quantity": 1}],
            "payment_method": "card",
        },
        headers=h,
    )
    store = client.get("/api/admin/orders", params={"channel": "store"}, headers=h).json()
    assert [(o["channel"], o["payment_method"], o["user_email"]) for o in store["items"]] == [
        ("store", "card", None)
    ]
    assert client.get("/api/admin/orders", headers=h).json()["total"] == 2

    stats = client.get("/api/admin/stats", headers=h).json()
    assert stats["revenue_by_channel"] == {"online": 100, "store": 100}
    assert (stats["store_sales_today"], stats["store_revenue_today"]) == (1, 100)


def test_every_stock_change_is_journaled(client, auth, catalog, db):
    h = auth(UserRole.admin)
    vid = catalog["coco50"].id
    buyer = auth()

    # Online order, then the customer cancels it.
    order = client.post(
        "/api/orders",
        json={**CHECKOUT, "items": [{"variant_id": vid, "quantity": 2}]},
        headers=buyer,
    ).json()
    client.post(f"/api/orders/{order['id']}/cancel", headers=buyer)
    # Goods received: admin edits the number with a note.
    r = client.patch(
        f"/api/admin/variants/{vid}",
        json={"stock": 25, "stock_note": "Приход от поставщика"},
        headers=h,
    )
    assert r.status_code == 200

    assert journal(db, vid) == [
        ("online_order", -2, 8),
        ("order_cancel", 2, 10),
        ("manual", 15, 25),
    ]
    hist = client.get(f"/api/admin/products/{catalog['coco'].id}/stock-movements", headers=h).json()
    assert hist[0]["reason"] == "manual"
    assert hist[0]["note"] == "Приход от поставщика"
    assert hist[0]["user_email"].endswith("@example.com")
    assert hist[0]["volume_ml"] == 50
    assert [m["reason"] for m in hist] == ["manual", "order_cancel", "online_order"]


def test_new_variant_and_import_are_journaled(client, auth, catalog, db):
    h = auth(UserRole.admin)
    r = client.post(
        f"/api/admin/products/{catalog['sauvage'].id}/variants",
        json={"volume_ml": 60, "retail_price": 70, "stock": 4},
        headers=h,
    )
    assert journal(db, r.json()["id"]) == [("manual", 4, 4)]

    csv = "Бренд;Название;Тип;Объём;Цена;Остаток\nDior;Sauvage;EDT;60;70;9\n".encode()
    client.post("/api/admin/import/catalog", files={"file": ("c.csv", csv, "text/csv")}, headers=h)
    assert journal(db, r.json()["id"]) == [("manual", 4, 4), ("import", 5, 9)]


def test_pricing_settings_include_store_discount(client, auth):
    h = auth(UserRole.admin)
    s = client.get("/api/admin/settings/pricing", headers=h).json()
    assert s["max_store_discount_percent"] == 10
    s.pop("updated_at")
    r = client.put(
        "/api/admin/settings/pricing", json={**s, "max_store_discount_percent": 15}, headers=h
    )
    assert r.json()["max_store_discount_percent"] == 15
