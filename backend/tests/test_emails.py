import pytest

from app.config import get_settings
from app.models import Order, OrderChannel, UserRole
from app.services import email as email_service

CHECKOUT = {
    "contact_name": "Анна",
    "contact_phone": "+7 700 123 45 67",
    "contact_email": "anna@example.com",
    "delivery_city": "Алматы",
    "delivery_address": "ул. Абая, 1",
}


@pytest.fixture
def outbox(monkeypatch):
    """SMTP is set up; the emails are collected instead of sent."""
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(get_settings(), "smtp_host", "smtp.example.com")
    monkeypatch.setattr(
        email_service, "send_email", lambda to, subject, body: sent.append((to, subject, body))
    )
    return sent


def test_the_customer_gets_emails_about_the_order(client, auth, catalog, outbox):
    h = auth(UserRole.retail)
    items = [{"variant_id": catalog["coco50"].id, "quantity": 2}]
    order = client.post("/api/orders", json={**CHECKOUT, "items": items}, headers=h).json()
    assert len(outbox) == 1
    to, subject, body = outbox[0]
    assert to == "anna@example.com"
    assert subject == f"Заказ №{order['id']} принят — Kyko Parfum"
    assert "Chanel Coco Mademoiselle, 50 мл × 2" in body and "Алматы, ул. Абая, 1" in body
    assert f"/account/orders/{order['id']}" in body

    admin = auth(UserRole.admin)
    url = f"/api/admin/orders/{order['id']}"
    assert client.patch(url, json={"status": "shipped"}, headers=admin).status_code == 200
    assert outbox[-1][:2] == ("anna@example.com", f"Заказ №{order['id']} отправлен — Kyko Parfum")
    # A note for the shop says nothing to the customer.
    client.patch(url, json={"admin_note": "позвонить"}, headers=admin)
    assert len(outbox) == 2


def test_no_emails_without_an_address_or_for_store_sales():
    online = Order(id=1, channel=OrderChannel.online, contact_email="admin")
    store = Order(id=2, channel=OrderChannel.store, contact_email="anna@example.com")
    assert email_service.recipient(online) is None
    assert email_service.recipient(store) is None


def test_without_smtp_no_emails_are_queued(client, auth, catalog, monkeypatch):
    sent = []
    monkeypatch.setattr(get_settings(), "smtp_host", "")
    monkeypatch.setattr(email_service, "send_email", lambda *args: sent.append(args))
    items = [{"variant_id": catalog["coco50"].id, "quantity": 1}]
    r = client.post("/api/orders", json={**CHECKOUT, "items": items}, headers=auth())
    assert r.status_code == 201 and sent == []


def test_a_reset_link_is_logged_only_when_asked(monkeypatch, caplog):
    monkeypatch.setattr(get_settings(), "smtp_host", "")
    monkeypatch.setattr(get_settings(), "email_log_body", False)
    with caplog.at_level("WARNING", logger="app.services.email"):
        email_service.send_password_reset("anna@example.com", "SECRET-TOKEN")
    assert "anna@example.com" in caplog.text and "SECRET-TOKEN" not in caplog.text

    caplog.clear()
    monkeypatch.setattr(get_settings(), "email_log_body", True)
    with caplog.at_level("WARNING", logger="app.services.email"):
        email_service.send_password_reset("anna@example.com", "SECRET-TOKEN")
    assert "reset-password?token=SECRET-TOKEN" in caplog.text
