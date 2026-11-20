"""Order notifications on customers' phones (the mobile app).

The app registers an Expo push token per phone (`push_tokens`, POST /me/push-tokens). When the
shop moves an online order to processing / shipped / delivered / cancelled, the customer's
phones get a notification through Expo's push service, which hands it to Apple (APNs) or Google
(FCM). Tapping it opens the order (`data.order_id`). Sending runs as a background task after
the response, so a slow or failing push service never breaks the admin panel. A token Expo
reports as `DeviceNotRegistered` (the app was removed) is forgotten.
"""

import json
import logging
import urllib.error
import urllib.request
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models import Order, OrderChannel, OrderStatus, PushToken

log = logging.getLogger(__name__)
TIMEOUT = 10
# Expo takes up to 100 messages per request.
BATCH = 100

# What the customer reads when the shop moves an online order on (the emails say the same).
STATUS_NEWS = {
    OrderStatus.processing: ("принят в работу", "Мы собираем ваш заказ."),
    OrderStatus.shipped: ("отправлен", "Заказ передан в доставку."),
    OrderStatus.delivered: ("доставлен", "Спасибо за покупку!"),
    OrderStatus.cancelled: ("отменён", "Если это ошибка, напишите нам в WhatsApp."),
}


class PushError(Exception):
    pass


def enabled() -> bool:
    return bool(get_settings().expo_push_url)


def call(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Send messages to Expo; returns one ticket per message, in the same order."""
    settings = get_settings()
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if settings.expo_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_access_token}"
    request = urllib.request.Request(
        settings.expo_push_url, data=json.dumps(messages).encode(), headers=headers
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:  # noqa: S310
            body = json.load(response)
    except urllib.error.HTTPError as e:
        raise PushError(f"Expo ответил {e.code}") from None
    except (OSError, ValueError):
        raise PushError("сервис уведомлений Expo не отвечает") from None
    tickets = body.get("data")
    if not isinstance(tickets, list):
        raise PushError("Expo вернул непонятный ответ")
    return tickets


def is_token(token: str) -> bool:
    return token.startswith(("ExponentPushToken[", "ExpoPushToken[")) and token.endswith("]")


def tokens_for(db: Session, user_id: int | None) -> list[str]:
    if user_id is None:
        return []
    return list(db.scalars(select(PushToken.token).where(PushToken.user_id == user_id)))


def order_status(order: Order) -> tuple[str, str] | None:
    """Title and text about an online order's new status; None when there is nothing to tell."""
    news = STATUS_NEWS.get(order.status)
    if news is None or order.channel != OrderChannel.online:
        return None
    word, more = news
    return f"Заказ №{order.id} {word}", more


def send(tokens: list[str], title: str, body: str, data: dict[str, Any]) -> None:
    """One notification to every phone; runs after the response, so it only logs failures."""
    dead: list[str] = []
    for start in range(0, len(tokens), BATCH):
        batch = tokens[start : start + BATCH]
        messages = [
            {
                "to": t,
                "title": title,
                "body": body,
                "data": data,
                "sound": "default",
                "channelId": "orders",
            }
            for t in batch
        ]
        try:
            tickets = call(messages)
        except PushError as e:
            log.warning("Push notification failed: %s", e)
            continue
        for token, ticket in zip(batch, tickets, strict=False):
            if ticket.get("status") == "ok":
                continue
            error = (ticket.get("details") or {}).get("error")
            if error == "DeviceNotRegistered":
                dead.append(token)
            else:
                log.warning("Push to a phone failed: %s", error or ticket.get("message"))
    if dead:
        with SessionLocal() as db:
            db.execute(delete(PushToken).where(PushToken.token.in_(dead)))
            db.commit()
