from app.models import PricingSettings, UserRole
from tests.conftest import login, make_user


def variants(client, product_id, headers=None):
    body = client.get(f"/api/products/{product_id}", headers=headers or {}).json()
    return {v["volume_ml"]: v for v in body["variants"]}


def test_wholesale_customers_see_bulk_price_as_next_price(client, catalog, auth, db):
    pid = catalog["coco"].id

    v = variants(client, pid, auth(UserRole.wholesale))
    assert (v[50]["price"], v[50]["next_tier"], v[50]["next_tier_price"]) == (80, "bulk", 70)
    assert v[50]["bulk_price"] is None  # the bulk column itself stays hidden
    # 100 ml has no bulk price (falls back to wholesale): nothing to tease.
    assert (v[100]["next_tier"], v[100]["next_tier_price"]) == (None, None)

    # Retail customers, guests and bulk customers get no teaser.
    for headers in (auth(UserRole.retail), None, auth(UserRole.bulk_wholesale)):
        v = variants(client, pid, headers)
        assert v[50]["next_tier_price"] is None


def test_teaser_can_be_switched_off(client, catalog, auth, db):
    db.get(PricingSettings, 1).show_next_tier = False
    db.commit()
    v = variants(client, catalog["coco"].id, auth(UserRole.wholesale))
    assert v[50]["next_tier_price"] is None


def test_pricing_rules_describe_the_next_level(client, auth, db):
    db.get(PricingSettings, 1).next_tier_terms = "От 300 000 ₸ закупок в месяц"
    db.commit()

    r = client.get("/api/pricing/rules", headers=auth(UserRole.wholesale)).json()
    assert (r["next_role"], r["next_tier"]) == ("bulk_wholesale", "bulk")
    assert r["next_tier_terms"] == "От 300 000 ₸ закупок в месяц"

    r = client.get("/api/pricing/rules", headers=auth(UserRole.retail)).json()
    assert (r["next_role"], r["next_tier"], r["next_tier_terms"]) == ("wholesale", None, None)

    r = client.get("/api/pricing/rules").json()
    assert r["next_role"] is None


def test_cart_shows_what_the_order_would_cost_at_bulk(client, catalog, auth):
    body = {
        "items": [
            {"variant_id": catalog["coco50"].id, "quantity": 2},
            {"variant_id": catalog["coco100"].id, "quantity": 1},
        ]
    }
    q = client.post("/api/cart/quote", json=body, headers=auth(UserRole.wholesale)).json()
    assert q["total"] == 2 * 80 + 120
    assert (q["next_tier"], q["next_tier_total"]) == ("bulk", 2 * 70 + 120)

    q = client.post("/api/cart/quote", json=body, headers=auth(UserRole.retail)).json()
    assert (q["next_tier"], q["next_tier_total"]) == (None, None)


def test_upgrade_requests(client, auth, db):
    admin = auth(UserRole.admin)

    # Retail -> wholesale needs company and phone.
    make_user(db, "shop@example.com")
    shop = login(client, "shop@example.com")
    r = client.post("/api/me/upgrade-request", json={}, headers=shop)
    assert r.status_code == 422
    r = client.post(
        "/api/me/upgrade-request",
        json={"company_name": "ИП Ароматов", "phone": "+7 700"},
        headers=shop,
    )
    assert (r.json()["requested_role"], r.json()["wholesale_requested"]) == ("wholesale", True)

    # Wholesale -> bulk: profile data is enough, a note is optional.
    whole = make_user(db, "trade@example.com", UserRole.wholesale)
    whole.company_name, whole.phone = "ТОО Трейд", "+7 701"
    db.commit()
    trade = login(client, "trade@example.com")
    r = client.post(
        "/api/me/upgrade-request", json={"note": "Берём 200 шт. в месяц"}, headers=trade
    )
    body = r.json()
    assert (body["requested_role"], body["upgrade_request_note"]) == (
        "bulk_wholesale",
        "Берём 200 шт. в месяц",
    )

    listed = client.get(
        "/api/admin/users", params={"wholesale_requested": True}, headers=admin
    ).json()
    assert {(u["email"], u["requested_role"]) for u in listed["items"]} == {
        ("shop@example.com", "wholesale"),
        ("trade@example.com", "bulk_wholesale"),
    }

    # Saving the same (lower) role keeps the bulk request open; granting bulk closes it.
    r = client.patch(f"/api/admin/users/{whole.id}", json={"role": "wholesale"}, headers=admin)
    assert r.json()["wholesale_requested"] is True
    r = client.patch(f"/api/admin/users/{whole.id}", json={"role": "bulk_wholesale"}, headers=admin)
    assert (r.json()["wholesale_requested"], r.json()["requested_role"]) == (False, None)

    # Bulk is the top level.
    r = client.post("/api/me/upgrade-request", json={}, headers=trade)
    assert r.status_code == 409


def test_admin_can_decline_a_request(client, auth, db):
    admin = auth(UserRole.admin)
    user = make_user(db, "shop@example.com")
    shop = login(client, "shop@example.com")
    client.post("/api/me/upgrade-request", json={"company_name": "ИП", "phone": "+7"}, headers=shop)
    r = client.patch(
        f"/api/admin/users/{user.id}", json={"wholesale_requested": False}, headers=admin
    )
    assert (r.json()["wholesale_requested"], r.json()["requested_role"]) == (False, None)
    assert r.json()["role"] == "retail"


def test_settings_roundtrip(client, auth):
    h = auth(UserRole.admin)
    s = client.get("/api/admin/settings/pricing", headers=h).json()
    assert s["show_next_tier"] is True
    s.pop("updated_at")
    r = client.put(
        "/api/admin/settings/pricing",
        json={**s, "show_next_tier": False, "next_tier_terms": "Условия у менеджера"},
        headers=h,
    ).json()
    assert (r["show_next_tier"], r["next_tier_terms"]) == (False, "Условия у менеджера")
