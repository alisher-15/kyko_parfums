"""Staff roles: what a cashier and the warehouse may do in the admin panel (app/permissions.py)."""

import pytest

from app.models import UserRole


def _status(client, h, method: str, url: str, **kwargs) -> int:
    return client.request(method, url, headers=h, **kwargs).status_code


@pytest.mark.parametrize(
    ("role", "allowed", "refused"),
    [
        (
            UserRole.cashier,
            [
                ("GET", "/api/admin/store/variants?q=coco"),
                ("GET", "/api/admin/orders"),
                ("GET", "/api/admin/users?q=anna"),
            ],
            [
                ("GET", "/api/admin/stats"),
                ("GET", "/api/admin/products"),
                ("GET", "/api/admin/receipts"),
                ("GET", "/api/admin/counts"),
                ("GET", "/api/admin/suppliers"),
                ("GET", "/api/admin/promotions"),
                ("GET", "/api/admin/settings/pricing"),
                ("GET", "/api/admin/telegram"),
                ("POST", "/api/admin/users"),
            ],
        ),
        (
            UserRole.warehouse,
            [
                ("GET", "/api/admin/receipts"),
                ("GET", "/api/admin/counts"),
                ("GET", "/api/admin/store/variants?q=coco"),
                ("GET", "/api/admin/orders"),
            ],
            [
                ("GET", "/api/admin/stats"),
                ("GET", "/api/admin/products"),
                ("GET", "/api/admin/users"),
                ("POST", "/api/admin/store/quote"),
                ("POST", "/api/admin/store/sales"),
                ("GET", "/api/admin/suppliers"),
                ("GET", "/api/admin/settings/pricing"),
            ],
        ),
    ],
)
def test_each_role_has_its_part_of_the_admin_panel(client, auth, catalog, role, allowed, refused):
    h = auth(role)
    for method, url in allowed:
        assert _status(client, h, method, url) == 200, (role, url)
    for method, url in refused:
        r = client.request(method, url, headers=h, json={})
        assert r.status_code == 403, (role, url, r.status_code)
        assert r.json()["detail"] == "Нет доступа к этому разделу"


def test_customers_are_not_staff(client, auth):
    for role in (UserRole.retail, UserRole.wholesale, UserRole.bulk_wholesale):
        r = client.get("/api/admin/orders", headers=auth(role))
        assert r.status_code == 403
        assert r.json()["detail"] == "Доступ только для сотрудников магазина"


def test_a_cashier_sells_without_seeing_the_cost(client, auth, catalog, db):
    catalog["coco50"].cost_price = 60
    db.commit()
    vid = catalog["coco50"].id
    cashier, owner = auth(UserRole.cashier), auth(UserRole.admin)

    found = client.get("/api/admin/store/variants", params={"q": "coco"}, headers=cashier).json()
    assert {i["cost_price"] for i in found} == {None}
    assert (
        client.get("/api/admin/store/variants", params={"q": "coco"}, headers=owner).json()[0][
            "cost_price"
        ]
        == 60
    )

    sale = {"items": [{"variant_id": vid, "quantity": 1}], "payment_method": "cash"}
    quote = client.post("/api/admin/store/quote", json=sale, headers=cashier).json()
    assert quote["lines"][0]["cost_price"] is None
    r = client.post("/api/admin/store/sales", json=sale, headers=cashier)
    assert r.status_code == 201, r.text
    # The order is the cashier's to move on and to see; prices and products are not.
    order_id = r.json()["id"]
    assert _status(client, cashier, "GET", f"/api/admin/orders/{order_id}") == 200
    reprice = {"retail_price": 1}
    assert _status(client, cashier, "PATCH", f"/api/admin/variants/{vid}", json=reprice) == 403


def test_staff_buy_at_retail_prices_and_the_owner_gives_the_roles(client, auth, catalog, db):
    owner = auth(UserRole.admin)
    me = auth(UserRole.retail)
    user_id = client.get("/api/me", headers=me).json()["id"]
    r = client.patch(f"/api/admin/users/{user_id}", json={"role": "warehouse"}, headers=owner)
    assert r.status_code == 200 and r.json()["role"] == "warehouse"
    product = client.get(f"/api/products/{catalog['coco'].id}", headers=me).json()
    assert {v["wholesale_price"] for v in product["variants"]} == {None}
    assert _status(client, me, "GET", "/api/admin/receipts") == 200
