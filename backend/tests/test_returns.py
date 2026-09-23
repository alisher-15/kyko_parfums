from app.models import UserRole
from tests.conftest import login, make_user
from tests.test_orders import CHECKOUT
from tests.test_store import journal, stock


def online_order(client, headers, items):
    r = client.post("/api/orders", json={**CHECKOUT, "items": items}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def items_by_volume(order):
    return {i["volume_ml"]: i for i in order["items"]}


# ---------- A. Editing an order before it is handed over ----------


def test_admin_removes_items_before_shipping(client, auth, catalog, db):
    h = auth(UserRole.admin)
    make_user(db, "shop@example.com", UserRole.wholesale)
    buyer = login(client, "shop@example.com")
    order = online_order(
        client,
        buyer,
        [
            {"variant_id": catalog["coco50"].id, "quantity": 3},
            {"variant_id": catalog["coco100"].id, "quantity": 2},
        ],
    )
    assert order["total_amount"] == 3 * 80 + 2 * 120
    lines = items_by_volume(order)

    r = client.patch(
        f"/api/admin/orders/{order['id']}/items",
        json={
            "items": [
                {"order_item_id": lines[50]["id"], "quantity": 1},
                {"order_item_id": lines[100]["id"], "quantity": 0},
            ],
            "reason": "нет в наличии",
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    edited = r.json()
    after = items_by_volume(edited)
    assert (after[50]["quantity"], after[50]["original_quantity"]) == (1, 3)
    assert (after[100]["quantity"], after[100]["original_quantity"]) == (0, 2)
    # Prices stay as at checkout (wholesale by role).
    assert after[50]["price_applied"] == 80
    assert edited["total_amount"] == 80
    assert edited["events"][-1]["kind"] == "edited"
    assert "нет в наличии" in edited["events"][-1]["message"]

    # Freed stock is back and journaled.
    assert stock(db, catalog["coco50"].id) == 9
    assert stock(db, catalog["coco100"].id) == 2
    assert journal(db, catalog["coco100"].id) == [("online_order", -2, 0), ("order_edit", 2, 2)]

    # The customer sees the same order, changed, with its history.
    mine = client.get(f"/api/orders/{order['id']}", headers=buyer).json()
    assert mine["total_amount"] == 80
    assert [e["kind"] for e in mine["events"]] == ["created", "edited"]
    listed = client.get("/api/orders", headers=buyer).json()["items"]
    assert [o["id"] for o in listed] == [order["id"]]


def test_edit_rules(client, auth, catalog):
    h = auth(UserRole.admin)
    order = online_order(client, auth(), [{"variant_id": catalog["coco50"].id, "quantity": 2}])
    item_id = order["items"][0]["id"]
    url = f"/api/admin/orders/{order['id']}/items"

    # Only decreasing is allowed.
    r = client.patch(url, json={"items": [{"order_item_id": item_id, "quantity": 5}]}, headers=h)
    assert r.status_code == 422
    # Removing everything = cancel the order instead.
    r = client.patch(url, json={"items": [{"order_item_id": item_id, "quantity": 0}]}, headers=h)
    assert r.status_code == 409
    # Not after shipping.
    client.patch(f"/api/admin/orders/{order['id']}", json={"status": "shipped"}, headers=h)
    r = client.patch(url, json={"items": [{"order_item_id": item_id, "quantity": 1}]}, headers=h)
    assert r.status_code == 409


def test_cancelling_an_edited_order_restocks_only_what_is_left(client, auth, catalog, db):
    h = auth(UserRole.admin)
    vid = catalog["coco50"].id
    order = online_order(client, auth(), [{"variant_id": vid, "quantity": 4}])
    item_id = order["items"][0]["id"]
    client.patch(
        f"/api/admin/orders/{order['id']}/items",
        json={"items": [{"order_item_id": item_id, "quantity": 1}]},
        headers=h,
    )
    client.patch(f"/api/admin/orders/{order['id']}", json={"status": "cancelled"}, headers=h)
    assert stock(db, vid) == 10
    assert journal(db, vid) == [
        ("online_order", -4, 6),
        ("order_edit", 3, 9),
        ("order_cancel", 1, 10),
    ]


# ---------- B. Returns after the goods were handed over ----------


def deliver(client, h, order_id):
    for st in ("shipped", "delivered"):
        r = client.patch(f"/api/admin/orders/{order_id}", json={"status": st}, headers=h)
        assert r.status_code == 200, r.text


def test_partial_returns_with_restock_and_write_off(client, auth, catalog, db):
    h = auth(UserRole.admin)
    buyer = auth()
    order = online_order(
        client,
        buyer,
        [
            {"variant_id": catalog["coco50"].id, "quantity": 3},
            {"variant_id": catalog["coco100"].id, "quantity": 2},
        ],
    )
    lines = items_by_volume(order)
    url = f"/api/admin/orders/{order['id']}/returns"

    # Not before delivery.
    body = {"items": [{"order_item_id": lines[50]["id"], "quantity": 1}]}
    assert client.post(url, json=body, headers=h).status_code == 409
    deliver(client, h, order["id"])

    # First return: 1×50 ml back on sale, 1×100 ml defective (written off).
    r = client.post(
        url,
        json={
            "items": [
                {"order_item_id": lines[50]["id"], "quantity": 1, "restock": True},
                {"order_item_id": lines[100]["id"], "quantity": 1, "restock": False},
            ],
            "refund_method": "card",
            "reason": "не подошёл аромат / разбит флакон",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    o = r.json()
    assert o["returned_amount"] == 100 + 150
    assert o["net_total"] == 3 * 100 + 2 * 150 - 250
    assert o["fully_returned"] is False
    ret = o["returns"][0]
    assert ret["refund_method"] == "card"
    assert [(i["quantity"], i["restock"], i["amount"]) for i in ret["items"]] == [
        (1, True, 100),
        (1, False, 150),
    ]
    assert items_by_volume(o)[50]["returned_quantity"] == 1
    assert o["events"][-1]["kind"] == "returned"
    assert "брак" in o["events"][-1]["message"]

    assert stock(db, catalog["coco50"].id) == 8  # 10 - 3 + 1
    assert stock(db, catalog["coco100"].id) == 0  # defective one isn't back on sale
    assert journal(db, catalog["coco100"].id) == [("online_order", -2, 0)]

    # Can't return more than was bought minus already returned.
    r = client.post(
        url, json={"items": [{"order_item_id": lines[50]["id"], "quantity": 3}]}, headers=h
    )
    assert r.status_code == 409
    assert "не больше 2" in r.json()["detail"]

    # Second return completes it.
    r = client.post(
        url,
        json={
            "items": [
                {"order_item_id": lines[50]["id"], "quantity": 2},
                {"order_item_id": lines[100]["id"], "quantity": 1},
            ]
        },
        headers=h,
    )
    o = r.json()
    assert o["fully_returned"] is True
    assert o["net_total"] == 0
    assert len(o["returns"]) == 2

    # Customer sees the returns; revenue on the dashboard is net of refunds.
    mine = client.get(f"/api/orders/{order['id']}", headers=buyer).json()
    assert mine["returned_amount"] == 600
    assert client.get("/api/orders", headers=buyer).json()["items"][0]["returned_amount"] == 600
    stats = client.get("/api/admin/stats", headers=h).json()
    assert (stats["revenue_total"], stats["refunds_total"]) == (0, 600)


def test_store_sale_partial_return_updates_today_revenue(client, auth, catalog, db):
    h = auth(UserRole.admin)
    order = client.post(
        "/api/admin/store/sales",
        json={
            "items": [{"variant_id": catalog["coco50"].id, "quantity": 2, "discount_percent": 10}]
        },
        headers=h,
    ).json()
    assert order["total_amount"] == 180
    r = client.post(
        f"/api/admin/orders/{order['id']}/returns",
        json={"items": [{"order_item_id": order["items"][0]["id"], "quantity": 1}]},
        headers=h,
    )
    # Refund at the price actually paid (with the discount).
    assert r.json()["returned_amount"] == 90
    stats = client.get("/api/admin/stats", headers=h).json()
    assert stats["store_revenue_today"] == 90
    assert stats["revenue_by_channel"]["store"] == 90
    listed = client.get("/api/admin/orders", params={"channel": "store"}, headers=h).json()
    assert listed["items"][0]["returned_amount"] == 90


def test_return_of_deleted_product_must_be_written_off(client, auth, catalog, db):
    h = auth(UserRole.admin)
    order = client.post(
        "/api/admin/store/sales",
        json={"items": [{"variant_id": catalog["coco50"].id, "quantity": 1}]},
        headers=h,
    ).json()
    client.delete(f"/api/admin/products/{catalog['coco'].id}", headers=h)
    item_id = order["items"][0]["id"]
    url = f"/api/admin/orders/{order['id']}/returns"
    r = client.post(url, json={"items": [{"order_item_id": item_id, "quantity": 1}]}, headers=h)
    assert r.status_code == 409
    r = client.post(
        url,
        json={"items": [{"order_item_id": item_id, "quantity": 1, "restock": False}]},
        headers=h,
    )
    assert r.status_code == 201


def test_returns_are_admin_only(client, auth, catalog):
    buyer = auth()
    order = online_order(client, buyer, [{"variant_id": catalog["coco50"].id, "quantity": 1}])
    r = client.post(
        f"/api/admin/orders/{order['id']}/returns",
        json={"items": [{"order_item_id": order["items"][0]["id"], "quantity": 1}]},
        headers=buyer,
    )
    assert r.status_code == 403
