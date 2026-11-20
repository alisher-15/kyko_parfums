from app.models import PasswordResetToken, User, UserRole
from tests.conftest import PASSWORD, login, make_user
from tests.test_orders import CHECKOUT


def _delete(client, headers, password=PASSWORD):
    return client.post("/api/me/delete", json={"password": password}, headers=headers)


def test_delete_account_erases_personal_data_and_ends_sessions(client, db):
    user = make_user(db, "anna@example.com")
    user.full_name = "Анна"
    user.phone = "+7 700 000 00 00"
    user.company_name = "ИП Анна"
    user.wholesale_requested = True
    user.requested_role = UserRole.wholesale
    user.upgrade_request_note = "Салон"
    db.commit()
    r = client.post("/api/auth/login", json={"email": "anna@example.com", "password": PASSWORD})
    tokens = r.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    client.post("/api/auth/forgot-password", json={"email": "anna@example.com"})

    r = _delete(client, headers)
    assert r.status_code == 204, r.text

    # The session is over: the access token, the refresh token and the password stop working.
    assert client.get("/api/me", headers=headers).status_code == 401
    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401
    r = client.post("/api/auth/login", json={"email": "anna@example.com", "password": PASSWORD})
    assert r.status_code == 401

    db.expire_all()
    gone = db.get(User, user.id)
    assert gone.email == f"deleted-{user.id}@deleted.invalid"
    assert (gone.full_name, gone.phone, gone.company_name) == (None, None, None)
    assert (gone.wholesale_requested, gone.requested_role, gone.upgrade_request_note) == (
        False,
        None,
        None,
    )
    assert gone.is_active is False
    assert db.query(PasswordResetToken).filter_by(user_id=user.id).count() == 0


def test_orders_stay_after_the_account_is_deleted(client, db, catalog, auth):
    make_user(db, "buyer@example.com")
    headers = login(client, "buyer@example.com")
    item = {"variant_id": catalog["coco50"].id, "quantity": 1}
    order = client.post("/api/orders", json={**CHECKOUT, "items": [item]}, headers=headers).json()

    assert _delete(client, headers).status_code == 204

    admin = auth(UserRole.admin)
    r = client.get(f"/api/admin/orders/{order['id']}", headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["contact_phone"] == CHECKOUT["contact_phone"]


def test_the_email_can_register_again(client, db):
    make_user(db, "again@example.com")
    assert _delete(client, login(client, "again@example.com")).status_code == 204

    r = client.post("/api/auth/register", json={"email": "again@example.com", "password": PASSWORD})
    assert r.status_code == 201, r.text
    assert r.json()["user"]["full_name"] is None


def test_wrong_password_keeps_the_account_and_is_throttled(client, db):
    make_user(db, "careful@example.com")
    headers = login(client, "careful@example.com")

    r = _delete(client, headers, "not-my-password")
    assert r.status_code == 400
    assert client.get("/api/me", headers=headers).status_code == 200

    for _ in range(12):
        _delete(client, headers, "not-my-password")
    r = _delete(client, headers)
    assert r.status_code == 429
    assert client.get("/api/me", headers=headers).json()["email"] == "careful@example.com"


def test_admin_account_cannot_be_deleted(client, auth):
    headers = auth(UserRole.admin)
    r = _delete(client, headers)
    assert r.status_code == 409
    assert client.get("/api/me", headers=headers).status_code == 200


def test_deleting_needs_a_session(client):
    assert client.post("/api/me/delete", json={"password": PASSWORD}).status_code == 401
