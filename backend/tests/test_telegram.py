from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest

from app.config import get_settings
from app.models import TelegramRecipient, UserRole
from app.services import telegram

CHECKOUT = {
    "contact_name": "Анна",
    "contact_phone": "+7 700 123 45 67",
    "delivery_city": "Алматы",
    "delivery_address": "ул. Абая, 1",
}


class FakeTelegram:
    """Stands in for telegram.call: records the calls and answers like the Bot API."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []
        self.updates: list[dict] = []
        self.blocked: set[int] = set()
        self.down = False

    def __call__(self, method, **params):
        self.calls.append((method, params))
        if self.down:
            raise telegram.TelegramError("Telegram не отвечает")
        if method == "getMe":
            return {"id": 1, "is_bot": True, "username": "kyko_orders_bot"}
        if method == "getUpdates":
            if "offset" in params:
                self.updates = [u for u in self.updates if u["update_id"] >= params["offset"]]
            return list(self.updates)
        if method == "sendMessage":
            if params["chat_id"] in self.blocked:
                raise telegram.TelegramError("Forbidden: bot was blocked by the user")
            return {"message_id": 1}
        raise AssertionError(method)

    def sent(self) -> list[tuple[int, str]]:
        return [(p["chat_id"], p["text"]) for m, p in self.calls if m == "sendMessage"]

    def start(self, chat: dict, text: str) -> None:
        """Someone pressed «Старт» (or added the bot to a group) with this text."""
        update_id = 100 + len(self.updates)
        self.updates.append({"update_id": update_id, "message": {"chat": chat, "text": text}})


PERSON = {"id": 111, "type": "private", "first_name": "Айгерим", "username": "aigerim"}
GROUP = {"id": -100500, "type": "supergroup", "title": "Kyko заказы"}


@pytest.fixture
def tg(monkeypatch):
    fake = FakeTelegram()
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:secret")
    monkeypatch.setattr(telegram, "call", fake)
    return fake


def add_recipient(db, chat_id: int, title: str) -> TelegramRecipient:
    r = TelegramRecipient(chat_id=chat_id, title=title)
    db.add(r)
    db.commit()
    return r


def place_order(client, auth, catalog) -> dict:
    headers = auth(UserRole.retail)
    item = {"variant_id": catalog["coco50"].id, "quantity": 2}
    r = client.post("/api/orders", json={**CHECKOUT, "items": [item]}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_link_code_is_signed_and_expires(monkeypatch):
    now = 1_800_000_000
    code = telegram.link_code(now)
    assert code.isalnum() and len(code) <= 64  # Telegram's limit for a start parameter
    assert telegram.code_is_good(code, now)
    assert telegram.code_is_good(code, now + telegram.LINK_TTL)
    assert not telegram.code_is_good(code, now + telegram.LINK_TTL + 1)
    assert not telegram.code_is_good(code, now - 60)  # not made yet
    assert not telegram.code_is_good(code[:-1] + ("0" if code[-1] != "0" else "1"), now)
    assert not telegram.code_is_good("hello", now)
    assert not telegram.code_is_good("", now)
    # Codes are signed with the server's secret: another server's code isn't good here.
    monkeypatch.setattr(get_settings(), "jwt_secret", "another-secret-with-enough-length")
    assert not telegram.code_is_good(code, now)


def test_admin_only(client, auth, tg):
    headers = auth(UserRole.wholesale)
    assert client.get("/api/admin/telegram", headers=headers).status_code == 403
    assert client.post("/api/admin/telegram/link", headers=headers).status_code == 403
    assert client.get("/api/admin/telegram").status_code == 401


def test_without_a_bot_nothing_is_sent(client, auth, catalog, db, monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "")
    fake = FakeTelegram()
    monkeypatch.setattr(telegram, "call", fake)
    add_recipient(db, 111, "Айгерим")
    admin = auth(UserRole.admin)

    state = client.get("/api/admin/telegram", headers=admin).json()
    assert state == {"enabled": False, "bot_username": None, "error": None, "recipients": []}
    for path in ("link", "check", "test"):
        r = client.post(f"/api/admin/telegram/{path}", headers=admin)
        assert r.status_code == 502
        assert r.json()["detail"] == "Telegram: бот не подключён: задайте TELEGRAM_BOT_TOKEN"
    place_order(client, auth, catalog)
    assert fake.calls == []


def test_connecting_a_person_and_a_group(client, auth, tg):
    admin = auth(UserRole.admin)
    state = client.get("/api/admin/telegram", headers=admin).json()
    assert state["enabled"] and state["bot_username"] == "kyko_orders_bot"
    assert state["recipients"] == []

    link = client.post("/api/admin/telegram/link", headers=admin).json()
    assert link["valid_hours"] == 24
    private, group = urlparse(link["private_url"]), urlparse(link["group_url"])
    assert private.netloc == "t.me" and private.path == "/kyko_orders_bot"
    code = parse_qs(private.query)["start"][0]
    assert parse_qs(group.query)["startgroup"] == [code]

    tg.start(PERSON, f"/start {code}")
    tg.start(GROUP, f"/start@kyko_orders_bot {code}")
    tg.start(PERSON, f"/start {code}")  # pressed twice
    stale = telegram.link_code(0)
    tg.start({"id": 222, "type": "private", "first_name": "Старая ссылка"}, f"/start {stale}")
    tg.start({"id": 333, "type": "private", "first_name": "Чужой"}, "/start")
    tg.start({"id": 444, "type": "private", "first_name": "Чужой"}, "/start 1234abcd")
    tg.start({"id": 555, "type": "private", "first_name": "Чужой"}, f"привет {code}")

    r = client.post("/api/admin/telegram/check", headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert [a["title"] for a in body["added"]] == ["Айгерим (@aigerim)", "Kyko заказы"]
    assert [a["title"] for a in body["recipients"]] == ["Айгерим (@aigerim)", "Kyko заказы"]
    # Each new chat is greeted, and the updates are marked read.
    assert [chat for chat, _ in tg.sent()] == [111, -100500]
    acks = [p["offset"] for m, p in tg.calls if m == "getUpdates" and "offset" in p]
    assert acks == [107]
    assert tg.updates == []

    # A later «Старт» from a chat that is already connected adds nothing.
    tg.start(GROUP, f"/start@kyko_orders_bot {code}")
    body = client.post("/api/admin/telegram/check", headers=admin).json()
    assert body["added"] == [] and len(body["recipients"]) == 2
    # Nothing new: no acknowledgement needed.
    before = len(tg.calls)
    client.post("/api/admin/telegram/check", headers=admin)
    assert [m for m, _ in tg.calls[before:]] == ["getUpdates"]


def test_new_order_goes_to_every_recipient(client, auth, catalog, db, tg):
    add_recipient(db, 111, "Айгерим")
    add_recipient(db, -100500, "Kyko заказы")
    tg.blocked.add(111)  # one of them blocked the bot; the others still get it
    order = place_order(client, auth, catalog)

    sent = tg.sent()
    assert [chat for chat, _ in sent] == [111, -100500]
    text = sent[1][1]
    assert text.startswith(f"Новый заказ №{order['id']} на 200 ₸")
    assert "• Chanel Coco Mademoiselle, 50 мл × 2" in text
    assert "Анна, +7 700 123 45 67" in text
    assert "Алматы, ул. Абая, 1" in text
    assert text.endswith(f"/admin/orders/{order['id']}")


def test_telegram_down_does_not_break_checkout(client, auth, catalog, db, tg):
    add_recipient(db, 111, "Айгерим")
    tg.down = True
    order = place_order(client, auth, catalog)
    assert order["status"] == "new"
    assert [m for m, _ in tg.calls] == ["sendMessage"]


def test_store_sales_are_not_sent(client, auth, catalog, db, tg):
    add_recipient(db, 111, "Айгерим")
    admin = auth(UserRole.admin)
    r = client.post(
        "/api/admin/store/sales",
        json={
            "items": [{"variant_id": catalog["coco50"].id, "quantity": 1}],
            "payment_method": "cash",
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    assert tg.sent() == []


def test_test_message_and_removing(client, auth, db, tg):
    admin = auth(UserRole.admin)
    r = client.post("/api/admin/telegram/test", headers=admin)
    assert r.status_code == 422
    assert r.json()["detail"] == "Сначала добавьте получателя"

    person = add_recipient(db, 111, "Айгерим")
    add_recipient(db, -100500, "Kyko заказы")
    tg.blocked.add(-100500)
    r = client.post("/api/admin/telegram/test", headers=admin)
    assert r.json() == {"sent": 1, "failed": ["Kyko заказы"]}

    assert (
        client.delete(f"/api/admin/telegram/recipients/{person.id}", headers=admin).status_code
        == 204
    )
    r = client.delete(f"/api/admin/telegram/recipients/{person.id}", headers=admin)
    assert r.status_code == 404
    state = client.get("/api/admin/telegram", headers=admin).json()
    assert [x["title"] for x in state["recipients"]] == ["Kyko заказы"]


def test_state_shows_why_the_bot_is_unreachable(client, auth, db, tg):
    add_recipient(db, 111, "Айгерим")
    tg.down = True
    admin = auth(UserRole.admin)
    state = client.get("/api/admin/telegram", headers=admin).json()
    assert state["enabled"] and state["bot_username"] is None
    assert state["error"] == "Telegram не отвечает"
    assert [x["title"] for x in state["recipients"]] == ["Айгерим"]
    r = client.post("/api/admin/telegram/check", headers=admin)
    assert r.status_code == 502
    assert r.json()["detail"] == "Telegram: Telegram не отвечает"


def test_a_big_order_fits_in_one_message():
    item = SimpleNamespace(
        brand_name="Maison Francis Kurkdjian",
        product_name="Baccarat Rouge 540 Extrait de Parfum",
        volume_ml=70,
        is_tester=False,
        quantity=12,
        backordered=0,
    )
    order = SimpleNamespace(
        id=42,
        total_amount=1_000_000,
        items=[item] * 200,
        contact_name="Анна",
        contact_phone="+7 700 123 45 67",
        delivery_city="Алматы",
        delivery_address="ул. Абая, 1",
        comment="Позвонить заранее. " * 200,
    )
    text = telegram.order_message(order)
    assert len(text) <= 4096
    assert "… и ещё позиций: " in text
    assert text.endswith("/admin/orders/42")


def test_the_token_never_shows_in_errors(monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:very-secret-token")

    def refuse(request, timeout):
        raise OSError(f"cannot reach {request.full_url}")

    monkeypatch.setattr(telegram.urllib.request, "urlopen", refuse)
    with pytest.raises(telegram.TelegramError) as e:
        telegram.call("getMe")
    assert "very-secret-token" not in str(e.value)
    assert e.value.__cause__ is None and e.value.__suppress_context__
