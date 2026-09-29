"""New-order messages in Telegram.

The shop's bot (its token in TELEGRAM_BOT_TOKEN, made with @BotFather) writes to the chats the
admin connected: people or groups (TelegramRecipient). A chat is connected with a link that
opens the bot with a signed code; pressing «Старт» sends "/start <code>" to the bot, and the
admin's «Проверить» reads the bot's new messages (getUpdates) and adds the chats whose code is
good. Nothing runs on a timer, and an order sends its message in the background, so a slow or
failing Telegram never holds or breaks checkout.
"""

import hashlib
import hmac
import json
import logging
import time
import urllib.error
import urllib.request
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Order, TelegramRecipient, volume_label
from app.services.orders import fmt_money

log = logging.getLogger(__name__)

TIMEOUT = 8  # seconds
# How long a connection link stays good.
LINK_TTL = 24 * 3600
_SIG_LEN = 16
# Telegram refuses longer messages (4096); big orders list the first lines and point to the admin.
MAX_MESSAGE = 3500


class TelegramError(Exception):
    """Telegram refused or didn't answer; the message is shown to the admin."""


def enabled() -> bool:
    return bool(get_settings().telegram_bot_token)


def call(method: str, **params: Any) -> Any:
    """One Bot API method. The token is in the URL, so it is never logged or put in errors."""
    token = get_settings().telegram_bot_token
    if not token:
        raise TelegramError("бот не подключён: задайте TELEGRAM_BOT_TOKEN")
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(params).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:  # noqa: S310
            body = json.load(response)
    except urllib.error.HTTPError as e:
        try:
            body = json.load(e)
        except ValueError:
            raise TelegramError(f"Telegram ответил {e.code}") from None
    except (OSError, ValueError):
        raise TelegramError("Telegram не отвечает") from None
    if not body.get("ok"):
        raise TelegramError(body.get("description") or "Telegram вернул ошибку")
    return body["result"]


def bot_username() -> str:
    return call("getMe")["username"]


# ---------- Connecting chats ----------


def _signature(stamp: str) -> str:
    key = get_settings().jwt_secret.encode()
    return hmac.new(key, f"telegram-link:{stamp}".encode(), hashlib.sha256).hexdigest()[:_SIG_LEN]


def link_code(now: float | None = None) -> str:
    """A code for the bot's start link: the time it was made and a signature (letters/digits)."""
    stamp = format(int(now if now is not None else time.time()), "x")
    return stamp + _signature(stamp)


def code_is_good(code: str, now: float | None = None) -> bool:
    stamp, sig = code[:-_SIG_LEN], code[-_SIG_LEN:]
    try:
        made = int(stamp, 16)
    except ValueError:
        return False
    fresh = 0 <= (now if now is not None else time.time()) - made <= LINK_TTL
    return fresh and hmac.compare_digest(sig, _signature(stamp))


def _chat_title(chat: dict) -> str:
    if chat.get("title"):  # a group
        return chat["title"]
    name = " ".join(filter(None, [chat.get("first_name"), chat.get("last_name")]))
    username = f"@{chat['username']}" if chat.get("username") else ""
    if name and username:
        return f"{name} ({username})"
    return name or username or str(chat["id"])


def connect_new_chats(db: Session) -> list[TelegramRecipient]:
    """Add the chats that pressed «Старт» on a good link since the last check."""
    updates = call("getUpdates", timeout=0, allowed_updates=["message"])
    added: list[TelegramRecipient] = []
    for update in updates:
        message = update.get("message") or {}
        words = (message.get("text") or "").split()
        # "/start <code>" in a private chat, "/start@bot <code>" when added to a group.
        if len(words) != 2 or words[0].split("@")[0] != "/start" or not code_is_good(words[1]):
            continue
        chat = message.get("chat") or {}
        if not isinstance(chat.get("id"), int):
            continue
        # Two checks at once (the page's own and a click) read the same updates: the chat is
        # added by one of them, the other skips it.
        recipient = db.scalars(
            insert(TelegramRecipient)
            .values(chat_id=chat["id"], title=_chat_title(chat)[:255])
            .on_conflict_do_nothing(index_elements=["chat_id"])
            .returning(TelegramRecipient)
        ).one_or_none()
        if recipient is not None:
            added.append(recipient)
    db.commit()
    if updates:
        # Mark them read, so the next check doesn't see them again.
        call("getUpdates", offset=updates[-1]["update_id"] + 1, timeout=0)
    for recipient in added:
        try:
            call(
                "sendMessage",
                chat_id=recipient.chat_id,
                text="Готово: сюда будут приходить новые заказы Kyko Parfum.",
            )
        except TelegramError as e:
            log.warning("Telegram welcome to %s failed: %s", recipient.chat_id, e)
    return added


def recipients(db: Session) -> list[TelegramRecipient]:
    return list(db.scalars(select(TelegramRecipient).order_by(TelegramRecipient.id)))


# ---------- Messages ----------


def order_message(order: Order) -> str:
    head = [f"Новый заказ №{order.id} на {fmt_money(order.total_amount)}", ""]
    items = []
    for item in order.items:
        line = (
            f"• {item.brand_name} {item.product_name}, "
            f"{volume_label(item.volume_ml, item.is_tester)} × {item.quantity}"
        )
        if item.backordered:
            line += f" (нет в наличии: {item.backordered} шт.)"
        items.append(line)
    tail = [
        "",
        f"{order.contact_name}, {order.contact_phone}",
        f"{order.delivery_city}, {order.delivery_address}",
    ]
    if order.comment:
        tail.append(f"Комментарий: {order.comment[:500]}")
    tail += ["", f"{get_settings().frontend_url.rstrip('/')}/admin/orders/{order.id}"]

    room = MAX_MESSAGE - len("\n".join(head + tail))
    shown = []
    for n, line in enumerate(items):
        if len(line) + 1 > room:
            shown.append(f"… и ещё позиций: {len(items) - n}, весь заказ в админке")
            break
        shown.append(line)
        room -= len(line) + 1
    return "\n".join(head + shown + tail)


def send_to_all(chat_ids: list[int], text: str) -> list[int]:
    """Send one message to every chat; a chat that fails doesn't stop the others.

    Returns the chats that failed. Runs after the response, so it only logs.
    """
    failed = []
    for chat_id in chat_ids:
        try:
            call("sendMessage", chat_id=chat_id, text=text, disable_web_page_preview=True)
        except TelegramError as e:
            log.warning("Telegram message to %s failed: %s", chat_id, e)
            failed.append(chat_id)
    return failed
