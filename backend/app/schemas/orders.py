from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import (
    OrderChannel,
    OrderEventKind,
    OrderStatus,
    PaymentMethod,
    PriceTier,
    PricingMode,
    UserRole,
)
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
    original_quantity: int
    returned_quantity: int
    list_price: Money
    discount_percent: float
    price_applied: Money
    price_tier: PriceTier
    line_total: Money


class OrderReturnItemOut(ORMModel):
    order_item_id: int
    product_label: str
    quantity: int
    restock: bool
    amount: Money


class OrderReturnOut(ORMModel):
    id: int
    created_at: datetime
    refund_amount: Money
    refund_method: PaymentMethod | None
    reason: str | None
    items: list[OrderReturnItemOut]


class OrderEventOut(ORMModel):
    kind: OrderEventKind
    message: str
    created_at: datetime


class OrderOut(ORMModel):
    id: int
    channel: OrderChannel
    status: OrderStatus
    total_amount: Money
    discount_total: Money
    customer_role: UserRole
    payment_method: PaymentMethod | None
    contact_name: str | None
    contact_phone: str | None
    contact_email: str | None
    delivery_city: str | None
    delivery_address: str | None
    comment: str | None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemOut]
    returned_amount: Money
    net_total: Money
    fully_returned: bool
    returns: list[OrderReturnOut]
    events: list[OrderEventOut]


class OrderBrief(ORMModel):
    id: int
    channel: OrderChannel
    status: OrderStatus
    total_amount: Money
    returned_amount: Money
    created_at: datetime
    items_count: int
