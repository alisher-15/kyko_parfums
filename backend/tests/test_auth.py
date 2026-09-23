from app.models import UserRole
from tests.conftest import PASSWORD, login, make_user


def test_register_login_me(client):
    r = client.post(
        "/api/auth/register",
        json={"email": "New@Example.com", "password": PASSWORD, "full_name": "Иван"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["email"] == "new@example.com"
    assert body["user"]["role"] == "retail"

    headers = {"Authorization": f"Bearer {body['access_token']}"}
    me = client.get("/api/me", headers=headers).json()
    assert me["full_name"] == "Иван"

    r = client.post("/api/auth/register", json={"email": "new@example.com", "password": PASSWORD})
    assert r.status_code == 409


def test_register_validates_password(client):
    r = client.post("/api/auth/register", json={"email": "a@b.co", "password": "short"})
    assert r.status_code == 422


def test_login_errors(client, db):
    make_user(db, "u@example.com")
    r = client.post("/api/auth/login", json={"email": "u@example.com", "password": "wrong-pass"})
    assert r.status_code == 401
    r = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
    assert r.status_code == 401


def test_blocked_user_cannot_login(client, db):
    user = make_user(db, "blocked@example.com")
    user.is_active = False
    db.commit()
    r = client.post("/api/auth/login", json={"email": "blocked@example.com", "password": PASSWORD})
    assert r.status_code == 403


def test_invalid_token_is_401_even_on_public_endpoints(client):
    r = client.get("/api/products", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401


def test_refresh_and_revocation_on_password_change(client, db):
    make_user(db, "u@example.com")
    tokens = client.post(
        "/api/auth/login", json={"email": "u@example.com", "password": PASSWORD}
    ).json()

    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    # An access token is not accepted as a refresh token.
    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert r.status_code == 401

    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    r = client.post(
        "/api/me/change-password",
        json={"current_password": PASSWORD, "new_password": "new-password-1"},
        headers=headers,
    )
    assert r.status_code == 200
    # The old refresh token is revoked.
    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_password_reset_flow(client, db, monkeypatch):
    make_user(db, "forgot@example.com")
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "app.routers.auth.send_password_reset", lambda to, token: sent.append((to, token))
    )

    r = client.post("/api/auth/forgot-password", json={"email": "forgot@example.com"})
    assert r.status_code == 200
    # Unknown emails get the same answer and no email.
    r2 = client.post("/api/auth/forgot-password", json={"email": "unknown@example.com"})
    assert r2.json() == r.json()
    assert len(sent) == 1
    token = sent[0][1]

    r = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "brand-new-1"}
    )
    assert r.status_code == 200
    # One-time token.
    r = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "brand-new-2"}
    )
    assert r.status_code == 400

    r = client.post(
        "/api/auth/login", json={"email": "forgot@example.com", "password": "brand-new-1"}
    )
    assert r.status_code == 200


def test_new_reset_link_invalidates_previous(client, db, monkeypatch):
    make_user(db, "forgot@example.com")
    sent: list[str] = []
    monkeypatch.setattr(
        "app.routers.auth.send_password_reset", lambda to, token: sent.append(token)
    )
    client.post("/api/auth/forgot-password", json={"email": "forgot@example.com"})
    client.post("/api/auth/forgot-password", json={"email": "forgot@example.com"})
    first, second = sent
    r = client.post(
        "/api/auth/reset-password", json={"token": first, "new_password": "brand-new-1"}
    )
    assert r.status_code == 400
    r = client.post(
        "/api/auth/reset-password", json={"token": second, "new_password": "brand-new-1"}
    )
    assert r.status_code == 200


def test_profile_and_wholesale_request(client, db):
    make_user(db, "shop@example.com")
    headers = login(client, "shop@example.com")
    r = client.patch("/api/me", json={"full_name": "Магазин"}, headers=headers)
    assert r.json()["full_name"] == "Магазин"

    r = client.post(
        "/api/me/wholesale-request",
        json={"company_name": "ТОО Парфюм", "phone": "+7 700 000 00 00"},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["wholesale_requested"] is True
    assert body["role"] == UserRole.retail.value


def test_login_with_plain_admin_login(client, monkeypatch):
    """ADMIN_EMAIL on Render may be a bare login like "admin" — it must still be able to sign in."""
    from app.cli import bootstrap

    monkeypatch.setenv("ADMIN_EMAIL", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin123")
    monkeypatch.delenv("SEED_DEMO", raising=False)
    bootstrap()
    r = client.post("/api/auth/login", json={"email": "Admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "admin"
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/admin/stats", headers=headers).status_code == 200
