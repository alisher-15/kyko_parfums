from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import OrderStatus, PriceTier, PricingMode, UserRole
from app.schemas.common import Money, ORMModel


class CartItemIn(BaseModel):
    variant_id: int
    quantity: int = Field(ge=1, le=10_000)


class QuoteIn(BaseModel):
    items: list[CartItemIn] = Field(max_length=200)


class QuoteLineOut(BaseModel):
    variant_id: int
    product_id: int
    product_name: str
    brand_name: str
    volume_ml: int
    image_url: str | None
    quantity: int
    stock: int
    available: bool
    price_tier: PriceTier
    unit_price: Money
    retail_unit_price: Money
    line_total: Money


class TierHintOut(BaseModel):
    tier: PriceTier
    missing_amount: Money | None = None
    variant_id: int | None = None
    missing_qty: int | None = None


class QuoteOut(BaseModel):
    mode: PricingMode
    lines: list[QuoteLineOut]
    # Variants from the cart that no longer exist / are hidden.
    unavailable_variant_ids: list[int]
    total: Money
    retail_total: Money
    savings: Money
    price_tier: PriceTier | None
    hints: list[TierHintOut]
    can_checkout: bool


class CheckoutIn(BaseModel):
    items: list[CartItemIn] = Field(min_length=1, max_length=200)
    contact_name: str = Field(min_length=1, max_length=255)
    contact_phone: str = Field(min_length=3, max_length=64)
    contact_email: EmailStr | None = None
    delivery_city: str = Field(min_length=1, max_length=128)
    delivery_address: str = Field(min_length=1, max_length=2000)
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("items")
    @classmethod
    def unique_variants(cls, v: list[CartItemIn]) -> list[CartItemIn]:
        ids = [i.variant_id for i in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Один и тот же вариант товара указан несколько раз")
        return v


class OrderItemOut(ORMModel):
    id: int
    variant_id: int | None
    product_id: int | None
    brand_name: str
    product_name: str
    volume_ml: int
    quantity: int
    price_applied: Money
    price_tier: PriceTier
    line_total: Money


class OrderOut(ORMModel):
    id: int
    status: OrderStatus
    total_amount: Money
    customer_role: UserRole
    contact_name: str
    contact_phone: str
    contact_email: str
    delivery_city: str
    delivery_address: str
    comment: str | None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemOut]


class OrderBrief(ORMModel):
    id: int
    status: OrderStatus
    total_amount: Money
    created_at: datetime
    items_count: int
