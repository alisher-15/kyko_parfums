"""Fixes from the code review of the whole shop: backorders on a cut line, the owner's figures,
the till's price levels, password guessing, the throttle under a flood, and photo links."""

import urllib.error

import pytest
from sqlalchemy import select

from app.models import OrderItem, User, UserRole, VariantBarcode
from app.services import throttle
from app.services.creatives import _PublicRedirects
from tests.conftest import login, make_user
from tests.test_stock_safety import order, stock_of


def test_cutting_a_partly_backordered_line_cuts_the_missing_units_first(client, auth, catalog, db):
    """2 in stock, 4 ordered: 2 are missing. Cut to 3: one unit comes off, the missing one."""
    h = auth(UserRole.admin)
    vid = catalog["coco100"].id
    placed = order(client, auth, vid, 4)
    item_id = placed["items"][0]["id"]
    assert db.get(OrderItem, item_id).backordered == 2
    r = client.patch(
        f"/api/admin/orders/{placed['id']}/items",
        json={"items": [{"order_item_id": item_id, "quantity": 3}]},
        headers=h,
    )
    assert r.status_code == 200, r.text
    item = db.get(OrderItem, item_id, populate_existing=True)
    assert (item.quantity, item.backordered) == (3, 1)
    assert stock_of(db, vid) == -1


def test_the_warehouse_sees_no_cost_by_barcode(client, auth, catalog, db):
    variant = catalog["coco50"]
    variant.cost_price = 40
    variant.barcodes.append(VariantBarcode(code="4006381333931"))
    db.commit()
    warehouse = auth(UserRole.warehouse)
    found = client.get("/api/admin/barcodes/4006381333931", headers=warehouse)
    assert found.status_code == 200, found.text
    assert found.json()["cost_price"] is None
    added = client.post(
        f"/api/admin/variants/{variant.id}/barcodes",
        json={"code": "5901234123457"},
        headers=warehouse,
    )
    assert added.status_code == 201, added.text
    assert added.json()["cost_price"] is None
    removed = client.delete(
        f"/api/admin/variants/{variant.id}/barcodes/5901234123457", headers=warehouse
    )
    assert removed.status_code == 200 and removed.json()["cost_price"] is None
    owner = client.get("/api/admin/barcodes/4006381333931", headers=auth(UserRole.admin))
    assert owner.json()["cost_price"] == 40


def test_a_cashier_cannot_sell_at_a_level_above_the_customer(client, auth, catalog, db):
    vid = catalog["coco50"].id
    body = {"items": [{"variant_id": vid, "quantity": 1}], "price_tier": "bulk"}
    cashier = auth(UserRole.cashier)
    assert client.post("/api/admin/store/quote", json=body, headers=cashier).status_code == 403
    assert client.post("/api/admin/store/sales", json=body, headers=cashier).status_code == 403
    assert stock_of(db, vid) == 10
    # A bulk customer gets bulk prices from the cashier too; the owner may choose any level.
    bulk = make_user(db, "bulk-buyer@example.com", UserRole.bulk_wholesale)
    with_customer = {**body, "customer_id": bulk.id}
    quoted = client.post("/api/admin/store/quote", json=with_customer, headers=cashier)
    assert quoted.status_code == 200 and quoted.json()["total"] == 70
    owner = client.post("/api/admin/store/quote", json=body, headers=auth(UserRole.admin))
    assert owner.status_code == 200 and owner.json()["total"] == 70


def test_change_password_is_throttled_like_a_login(client, db):
    make_user(db, "guess@example.com")
    h = login(client, "guess@example.com")
    wrong = {"current_password": "not-the-password", "new_password": "new-password-123"}
    for _ in range(10):
        assert client.post("/api/me/change-password", json=wrong, headers=h).status_code == 400
    r = client.post("/api/me/change-password", json=wrong, headers=h)
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_a_flood_of_emails_does_not_unlock_a_guessed_one(monkeypatch):
    monkeypatch.setattr(throttle, "MAX_KEYS", 50)
    t = throttle.Throttle(limit=3, window=900)
    for _ in range(3):
        t.hit("victim@example.com")
    assert t.retry_after("victim@example.com") > 0
    for i in range(500):
        t.hit(f"junk{i}@example.com")
    assert t.retry_after("victim@example.com") > 0


def test_a_null_role_changes_nothing(client, auth, db):
    user = make_user(db, "someone@example.com", UserRole.wholesale)
    r = client.patch(
        f"/api/admin/users/{user.id}",
        json={"role": None, "is_active": None},
        headers=auth(UserRole.admin),
    )
    assert r.status_code == 200, r.text
    fresh = db.scalar(
        select(User).where(User.id == user.id).execution_options(populate_existing=True)
    )
    assert (fresh.role, fresh.is_active) == (UserRole.wholesale, True)


@pytest.mark.parametrize(
    "target",
    [
        "http://169.254.169.254/latest/meta-data/",
        "https://127.0.0.1/admin",
        "https://localhost/x.jpg",
        "http://example.com/x.jpg",
    ],
)
def test_a_photo_link_cannot_redirect_inside(target):
    handler = _PublicRedirects()
    with pytest.raises(urllib.error.HTTPError):
        handler.redirect_request(None, None, 302, "Found", {}, target)
