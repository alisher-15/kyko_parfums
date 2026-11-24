from typing import Literal

from pydantic import BaseModel, Field, field_validator


def _blank_to_none(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


class CreativeIn(BaseModel):
    """A banner (1200×800) or a story (1080×1920) drawn from a template (services/creatives.py)."""

    format: Literal["banner", "story"] = "banner"
    theme: Literal["dark", "light", "gold"] = "dark"
    title: str = Field(min_length=1, max_length=80)
    subtitle: str | None = Field(default=None, max_length=160)
    # «−15%», «Хит»: a gold pill.
    badge: str | None = Field(default=None, max_length=16)
    # «до 30 ноября»: next to the badge.
    note: str | None = Field(default=None, max_length=40)
    # Up to three bottles, in this order; none: text only.
    product_ids: list[int] = Field(default_factory=list, max_length=3)

    _blank = field_validator("subtitle", "badge", "note", mode="before")(_blank_to_none)

    @field_validator("title")
    @classmethod
    def strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Напишите заголовок")
        return v


class CreativeOut(BaseModel):
    width: int
    height: int
    # save=false: the picture itself, to look at or download (data:image/jpeg;base64,…).
    preview: str | None = None
    # save=true: where it is kept (the bucket or media/), e.g. for a promotion's banner.
    url: str | None = None
    # Products whose photo couldn't be read: their place stays empty.
    missing_photos: list[int] = Field(default_factory=list)
