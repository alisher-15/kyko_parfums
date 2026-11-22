import pytest

from app.models import PushToken, UserRole
from app.services import push
from tests.conftest import PASSWORD, login, make_user
from tests.test_orders import CHECKOUT

TOKEN = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]"
OTHER = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]"


class Sent(list):
    """Pushes «sent» to Expo, one list of messages per request; `tickets` sets Expo's answer
    per token (ok by default)."""

    def __init__(self):
        super().__init__()
        self.tickets: dict[str, dict] = {}

    def __call__(self, messages):
        self.append(messages)
        return [self.tickets.get(m["to"], {"status": "ok", "id": "x"}) for m in messages]


@pytest.fixture
def sent(monkeypatch):
    fake = Sent()
    monkeypatch.setattr(push, "enabled", lambda: True)
    monkeypatch.setattr(push, "call", fake)
    return fake


def _patch(client, order, admin, body):
    return client.patch(f"/api/admin/orders/{order['id']}", json=body, headers=admin)


def _tokens(db):
    db.expire_all()
    return {t.token: t.user_id for t in db.query(PushToken)}


def _order(client, catalog, headers):
    item = {"variant_id": catalog["coco50"].id, "quantity": 1}
    r = client.post("/api/orders", json={**CHECKOUT, "items": [item]}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_register_and_move_a_phone(client, db):
    anna = make_user(db, "anna@example.com")
    bob = make_user(db, "bob@example.com")
    body = {"token": TOKEN, "platform": "ios"}

    assert client.post("/api/me/push-tokens", json=body).status_code == 401
    r = client.post("/api/me/push-tokens", json=body, headers=login(client, "anna@example.com"))
    assert r.status_code == 204, r.text
    # Twice is fine: still one row.
    client.post("/api/me/push-tokens", json=body, headers=login(client, "anna@example.com"))
    assert _tokens(db) == {TOKEN: anna.id}

    # Bob signs in on the same phone: the phone now gets his notifications, not Anna's.
    client.post("/api/me/push-tokens", json=body, headers=login(client, "bob@example.com"))
    assert _tokens(db) == {TOKEN: bob.id}

    r = client.post(
        "/api/me/push-tokens",
        json={"token": "not-an-expo-token"},
        headers=login(client, "bob@example.com"),
    )
    assert r.status_code == 422


def test_logout_forgets_the_phone_without_a_session(client, db):
    make_user(db, "anna@example.com")
    headers = login(client, "anna@example.com")
    client.post("/api/me/push-tokens", json={"token": TOKEN}, headers=headers)
    client.post("/api/me/push-tokens", json={"token": OTHER}, headers=headers)

    r = client.post("/api/auth/push-tokens/forget", json={"token": TOKEN})
    assert r.status_code == 204
    assert set(_tokens(db)) == {OTHER}


def test_status_change_notifies_the_customers_phones(client, db, catalog, auth, sent):
    make_user(db, "anna@example.com")
    headers = login(client, "anna@example.com")
    client.post("/api/me/push-tokens", json={"token": TOKEN}, headers=headers)
    client.post("/api/me/push-tokens", json={"token": OTHER}, headers=headers)
    order = _order(client, catalog, headers)
    admin = auth(UserRole.admin)

    r = _patch(client, order, admin, {"status": "processing"})
    assert r.status_code == 200, r.text
    assert len(sent) == 1
    assert {m["to"] for m in sent[0]} == {TOKEN, OTHER}
    message = sent[0][0]
    assert message["title"] == f"Заказ №{order['id']} принят в работу"
    assert message["body"] == "Мы собираем ваш заказ."
    assert message["data"] == {"order_id": order["id"]}
    assert message["channelId"] == "orders"

    # A note without a new status says nothing.
    _patch(client, order, admin, {"admin_note": "позвонить"})
    assert len(sent) == 1

    _patch(client, order, admin, {"status": "shipped"})
    assert sent[-1][0]["title"] == f"Заказ №{order['id']} отправлен"


def test_no_push_without_phones_or_for_other_customers(client, db, catalog, auth, sent):
    make_user(db, "anna@example.com")
    make_user(db, "bob@example.com")
    client.post(
        "/api/me/push-tokens", json={"token": TOKEN}, headers=login(client, "bob@example.com")
    )
    order = _order(client, catalog, login(client, "anna@example.com"))

    admin = auth(UserRole.admin)
    _patch(client, order, admin, {"status": "processing"})
    assert sent == []


def test_a_removed_app_is_forgotten_and_errors_dont_break_anything(client, db, catalog, auth, sent):
    anna = make_user(db, "anna@example.com")
    headers = login(client, "anna@example.com")
    client.post("/api/me/push-tokens", json={"token": TOKEN}, headers=headers)
    client.post("/api/me/push-tokens", json={"token": OTHER}, headers=headers)
    sent.tickets[TOKEN] = {"status": "error", "details": {"error": "DeviceNotRegistered"}}
    sent.tickets[OTHER] = {"status": "error", "details": {"error": "MessageRateExceeded"}}
    order = _order(client, catalog, headers)

    admin = auth(UserRole.admin)
    r = _patch(client, order, admin, {"status": "processing"})
    assert r.status_code == 200
    # The app was removed from that phone: forgotten. A passing error keeps the token.
    assert _tokens(db) == {OTHER: anna.id}


def test_expo_down_never_breaks_the_admin_panel(client, db, catalog, auth, monkeypatch):
    def down(messages):
        raise push.PushError("сервис уведомлений Expo не отвечает")

    monkeypatch.setattr(push, "enabled", lambda: True)
    monkeypatch.setattr(push, "call", down)
    make_user(db, "anna@example.com")
    headers = login(client, "anna@example.com")
    client.post("/api/me/push-tokens", json={"token": TOKEN}, headers=headers)
    order = _order(client, catalog, headers)

    admin = auth(UserRole.admin)
    r = _patch(client, order, admin, {"status": "processing"})
    assert r.status_code == 200
    assert TOKEN in _tokens(db)


def test_deleting_the_account_forgets_its_phones(client, db):
    make_user(db, "anna@example.com")
    headers = login(client, "anna@example.com")
    client.post("/api/me/push-tokens", json={"token": TOKEN}, headers=headers)

    r = client.post("/api/me/delete", json={"password": PASSWORD}, headers=headers)
    assert r.status_code == 204
    assert _tokens(db) == {}
