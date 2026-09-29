from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel


class TelegramRecipientOut(ORMModel):
    id: int
    title: str
    created_at: datetime


class TelegramStateOut(BaseModel):
    # False until TELEGRAM_BOT_TOKEN is set.
    enabled: bool
    bot_username: str | None = None
    # Why the bot couldn't be reached (a wrong token, Telegram down).
    error: str | None = None
    recipients: list[TelegramRecipientOut] = []


class TelegramLinkOut(BaseModel):
    # Open in Telegram and press «Старт»: a person gets the messages in their chat with the bot.
    private_url: str
    # Pick a group: the bot joins it and the whole group gets the messages.
    group_url: str
    valid_hours: int


class TelegramCheckOut(BaseModel):
    added: list[TelegramRecipientOut]
    recipients: list[TelegramRecipientOut]


class TelegramTestOut(BaseModel):
    sent: int
    failed: list[str]
