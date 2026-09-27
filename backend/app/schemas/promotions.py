from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel


class PromotionStatus(StrEnum):
    running = "running"  # on the site today
    scheduled = "scheduled"  # starts later
    ended = "ended"
    off = "off"  # switched off by hand


def _blank_to_none(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


class PromotionIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    image_url: str | None = Field(default=None, max_length=1024)
    # Percent off the retail price; None = a banner only.
    discount_percent: Decimal | None = Field(default=None, gt=0, lt=100, decimal_places=2)
    # Inclusive; None = from now on / until switched off.
    starts_on: date | None = None
    ends_on: date | None = None
    is_active: bool = True
    all_products: bool = False
    brand_ids: list[int] = Field(default_factory=list, max_length=1000)
    product_ids: list[int] = Field(default_factory=list, max_length=10_000)

    _blank = field_validator("description", "image_url", mode="before")(_blank_to_none)

    @field_validator("title")
    @classmethod
    def strip(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Укажите название акции")
        return v.strip()

    @model_validator(mode="after")
    def check(self):
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("Акция не может закончиться раньше, чем начнётся")
        if (
            self.discount_percent is not None
            and not self.all_products
            and not self.brand_ids
            and not self.product_ids
        ):
            raise ValueError("Выберите, на что действует скидка: весь каталог, бренды или товары")
        return self


class PromotionBrand(ORMModel):
    id: int
    name: str


class PromotionProduct(ORMModel):
    id: int
    name: str
    brand: PromotionBrand


class PromotionBrief(ORMModel):
    id: int
    title: str
    image_url: str | None
    discount_percent: float | None
    starts_on: date | None
    ends_on: date | None
    is_active: bool
    all_products: bool
    brands_count: int = 0
    products_count: int = 0
    status: PromotionStatus


class PromotionOut(PromotionBrief):
    description: str | None
    brands: list[PromotionBrand]
    products: list[PromotionProduct]
    created_at: datetime
    updated_at: datetime
