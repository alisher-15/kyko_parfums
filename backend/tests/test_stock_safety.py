"""Edits that must never overwrite what orders did to stock: most of the catalog is sold before
it is bought (backorders), so a minus is common and must survive any edit."""

from sqlalchemy import select

from app.models import OrderItem, ProductVariant, UserRole
from tests.test_orders import CHECKOUT


def order(client, auth, variant_id: int, quantity: int) -> dict:
    r = client.post(
        "/api/orders",
        json={**CHECKOUT, "items": [{"variant_id": variant_id, "quantity": quantity}]},
        headers=auth(UserRole.retail),
    )
    assert r.status_code == 201, r.text
    return r.json()


def stock_of(db, variant_id: int) -> int:
    return db.scalar(
        select(ProductVariant.stock)
        .where(ProductVariant.id == variant_id)
        .execution_options(populate_existing=True)
    )


def test_a_price_edit_keeps_the_stock_an_order_changed(client, auth, catalog, db):
    """The form was opened at 10, an order took 3: saving the price leaves 7."""
    h = auth(UserRole.admin)
    vid = catalog["coco50"].id
    order(client, auth, vid, 3)
    # A form sends the stock only when the owner changed it; the stock it was opened with is 10.
    r = client.patch(f"/api/admin/variants/{vid}", json={"retail_price": 120}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["stock"] == 7 and r.json()["retail_price"] == 120


def test_a_stale_stock_is_refused(client, auth, catalog, db):
    h = auth(UserRole.admin)
    vid = catalog["coco50"].id
    order(client, auth, vid, 3)
    r = client.patch(
        f"/api/admin/variants/{vid}",
        json={"stock": 12, "stock_expected": 10, "retail_price": 120},
        headers=h,
    )
    assert r.status_code == 409
    assert "сейчас 7 шт." in r.json()["detail"]
    assert stock_of(db, vid) == 7
    # With the stock it sees now, the owner's count goes through.
    r = client.patch(
        f"/api/admin/variants/{vid}", json={"stock": 12, "stock_expected": 7}, headers=h
    )
    assert r.status_code == 200 and r.json()["stock"] == 12


def test_a_backordered_volume_can_be_repriced(client, auth, catalog, db):
    """Stock 0, a customer orders 2 (stock −2): its price can still be changed, and the minus
    (what the customer is owed) stays."""
    h = auth(UserRole.admin)
    vid = catalog["sauvage100"].id
    order(client, auth, vid, 2)
    assert stock_of(db, vid) == -2
    for body in (
        {"retail_price": 95},
        # Older apps send the stock they show, unchanged: no 422 for the minus.
        {"retail_price": 96, "stock": -2},
    ):
        r = client.patch(f"/api/admin/variants/{vid}", json=body, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["stock"] == -2
    # Setting a minus by hand is still not allowed.
    r = client.patch(f"/api/admin/variants/{vid}", json={"stock": -5}, headers=h)
    assert r.status_code == 422


def test_cutting_an_order_line_cuts_its_backorder(client, auth, catalog, db):
    """3 ordered with none in stock, then cut to 1: 1 is missing, not 3."""
    h = auth(UserRole.admin)
    vid = catalog["sauvage100"].id
    placed = order(client, auth, vid, 3)
    item_id = placed["items"][0]["id"]
    r = client.patch(
        f"/api/admin/orders/{placed['id']}/items",
        json={"items": [{"order_item_id": item_id, "quantity": 1}]},
        headers=h,
    )
    assert r.status_code == 200, r.text
    item = db.get(OrderItem, item_id, populate_existing=True)
    assert (item.quantity, item.backordered) == (1, 1)
    assert stock_of(db, vid) == -1


def test_cancelling_a_backorder_while_others_are_owed(client, auth, catalog, db):
    """Two customers ordered 2 each with none in stock (−4); cancelling one leaves −2."""
    h = auth(UserRole.admin)
    vid = catalog["sauvage100"].id
    first = order(client, auth, vid, 2)
    order(client, auth, vid, 2)
    r = client.patch(f"/api/admin/orders/{first['id']}", json={"status": "cancelled"}, headers=h)
    assert r.status_code == 200, r.text
    assert stock_of(db, vid) == -2


def test_an_import_keeps_a_minus(client, auth, catalog, db):
    """A file's «Остаток» replaces a stock, but never what customers are owed."""
    from tests.test_admin import xlsx

    h = auth(UserRole.admin)
    order(client, auth, catalog["sauvage100"].id, 2)  # 0 → −2
    content = xlsx(
        [
            ["Бренд", "Название", "Тип", "Объём", "Цена", "Остаток"],
            ["Dior", "Sauvage", "EDT", 100, 90, 5],
            ["Chanel", "Coco Mademoiselle", "EDP", 50, 100, 4],
        ]
    )
    files = {"file": ("catalog.xlsx", content, "application/octet-stream")}
    report = client.post("/api/admin/import/catalog", files=files, headers=h).json()
    assert [e["row"] for e in report["errors"]] == [2]
    assert "2 шт. ждут клиенты" in report["errors"][0]["error"]
    assert stock_of(db, catalog["sauvage100"].id) == -2
    assert stock_of(db, catalog["coco50"].id) == 4


def test_a_retried_checkout_places_one_order(client, auth, catalog, db):
    """The answer to a checkout was lost and the customer pressed again: one order, one
    deduction."""
    h = auth(UserRole.wholesale)
    vid = catalog["coco50"].id
    body = {**CHECKOUT, "items": [{"variant_id": vid, "quantity": 2}], "request_key": "k" * 20}
    first = client.post("/api/orders", json=body, headers=h)
    again = client.post("/api/orders", json=body, headers=h)
    assert first.status_code == again.status_code == 201
    assert again.json()["id"] == first.json()["id"]
    assert stock_of(db, vid) == 8
    # A guest can't open that order with the key, and another account can't either.
    assert client.post("/api/orders", json=body).status_code == 409
    assert (
        client.post("/api/orders", json=body, headers=auth(UserRole.wholesale)).status_code == 409
    )


def test_a_retried_guest_checkout_returns_its_link(client, catalog, db):
    body = {
        **CHECKOUT,
        "items": [{"variant_id": catalog["coco50"].id, "quantity": 1}],
        "request_key": "guest-key-123",
    }
    first = client.post("/api/orders", json=body).json()
    again = client.post("/api/orders", json=body).json()
    assert again["id"] == first["id"] and again["guest_key"] == first["guest_key"]


def test_a_retried_till_sale_is_recorded_once(client, auth, catalog, db):
    h = auth(UserRole.admin)
    vid = catalog["coco50"].id
    body = {"items": [{"variant_id": vid, "quantity": 1}], "request_key": "till-sale-0001"}
    first = client.post("/api/admin/store/sales", json=body, headers=h)
    again = client.post("/api/admin/store/sales", json=body, headers=h)
    assert first.status_code == again.status_code == 201
    assert again.json()["id"] == first.json()["id"]
    assert stock_of(db, vid) == 9


def test_a_till_sale_with_another_total_is_refused(client, auth, catalog, db):
    """The button said 100 (one bottle), the receipt already had two: nothing is recorded."""
    h = auth(UserRole.admin)
    vid = catalog["coco50"].id
    body = {"items": [{"variant_id": vid, "quantity": 2}], "expected_total": 100}
    r = client.post("/api/admin/store/sales", json=body, headers=h)
    assert r.status_code == 409
    assert "теперь 200" in r.json()["detail"]["message"]
    assert stock_of(db, vid) == 10
    body["expected_total"] = 200
    assert client.post("/api/admin/store/sales", json=body, headers=h).status_code == 201
