"""Who gets the new-order messages in Telegram (see services/telegram.py)."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import TelegramRecipient
from app.schemas.telegram import (
    TelegramCheckOut,
    TelegramLinkOut,
    TelegramStateOut,
    TelegramTestOut,
)
from app.services import telegram

router = APIRouter(prefix="/telegram")


def _unreachable(e: telegram.TelegramError) -> HTTPException:
    return HTTPException(status.HTTP_502_BAD_GATEWAY, f"Telegram: {e}")


def _require_bot() -> None:
    if not telegram.enabled():
        raise _unreachable(telegram.TelegramError("бот не подключён: задайте TELEGRAM_BOT_TOKEN"))


@router.get("", response_model=TelegramStateOut)
def state(db: Session = Depends(get_db)):
    if not telegram.enabled():
        return TelegramStateOut(enabled=False)
    out = TelegramStateOut(enabled=True, recipients=telegram.recipients(db))
    try:
        out.bot_username = telegram.bot_username()
    except telegram.TelegramError as e:
        out.error = str(e)
    return out


@router.post("/link", response_model=TelegramLinkOut)
def link():
    _require_bot()
    try:
        username = telegram.bot_username()
    except telegram.TelegramError as e:
        raise _unreachable(e) from e
    code = telegram.link_code()
    return TelegramLinkOut(
        private_url=f"https://t.me/{username}?start={code}",
        group_url=f"https://t.me/{username}?startgroup={code}",
        valid_hours=telegram.LINK_TTL // 3600,
    )


@router.post("/check", response_model=TelegramCheckOut)
def check(db: Session = Depends(get_db)):
    _require_bot()
    try:
        added = telegram.connect_new_chats(db)
    except telegram.TelegramError as e:
        raise _unreachable(e) from e
    return TelegramCheckOut(added=added, recipients=telegram.recipients(db))


@router.delete("/recipients/{recipient_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove(recipient_id: int, db: Session = Depends(get_db)):
    recipient = db.get(TelegramRecipient, recipient_id)
    if recipient is None:
        raise HTTPException(404, "Получатель не найден")
    db.delete(recipient)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/test", response_model=TelegramTestOut)
def send_test(db: Session = Depends(get_db)):
    _require_bot()
    chats = telegram.recipients(db)
    if not chats:
        raise HTTPException(422, "Сначала добавьте получателя")
    failed = set(
        telegram.send_to_all(
            [c.chat_id for c in chats], "Проверка: уведомления о заказах Kyko Parfum работают."
        )
    )
    return TelegramTestOut(
        sent=len(chats) - len(failed), failed=[c.title for c in chats if c.chat_id in failed]
    )
