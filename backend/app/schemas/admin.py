from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models import (
    Gender,
    OrderChannel,
    OrderStatus,
    PaymentMethod,
    PriceTier,
    PricingMode,
    StockReason,
    UserRole,
)
from app.schemas.auth import Password, UserOut
from app.schemas.common import Money, MoneyIn, ORMModel
from app.schemas.orders import OrderOut

# ---------- Brands ----------


class BrandIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    logo_url: str | None = Field(default=None, max_length=1024)
    description: str | None = None

    @field_validator("name")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()


class BrandUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    logo_url: str | None = Field(default=None, max_length=1024)
    description: str | None = None


# ---------- Variants ----------


def _blank_to_none(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def check_price_order(retail, wholesale, bulk) -> None:
    if wholesale is not None and retail is not None and wholesale > retail:
        raise ValueError("Оптовая цена не может быть выше розничной")
    if bulk is not None and wholesale is not None and bulk > wholesale:
        raise ValueError("Цена крупного опта не может быть выше оптовой")
    if bulk is not None and retail is not None and bulk > retail:
        raise ValueError("Цена крупного опта не может быть выше розничной")


class VariantIn(BaseModel):
    volume_ml: int = Field(gt=0, le=100_000)
    sku: str | None = Field(default=None, max_length=64)
    stock: int = Field(default=0, ge=0)
    retail_price: MoneyIn
    wholesale_price: MoneyIn | None = None
    bulk_price: MoneyIn | None = None
    photo_url: str | None = Field(default=None, max_length=1024)
    is_active: bool = True

    _sku = field_validator("sku", "photo_url", mode="before")(_blank_to_none)

    @model_validator(mode="after")
    def prices(self):
        check_price_order(self.retail_price, self.wholesale_price, self.bulk_price)
        return self


class VariantUpdate(BaseModel):
    volume_ml: int | None = Field(default=None, gt=0, le=100_000)
    sku: str | None = Field(default=None, max_length=64)
    stock: int | None = Field(default=None, ge=0)
    # Why the stock changed ("приход от поставщика", "пересчёт") — saved in the stock journal.
    stock_note: str | None = Field(default=None, max_length=255)
    retail_price: MoneyIn | None = None
    wholesale_price: MoneyIn | None = None
    bulk_price: MoneyIn | None = None
    photo_url: str | None = Field(default=None, max_length=1024)
    is_active: bool | None = None

    _sku = field_validator("sku", "photo_url", mode="before")(_blank_to_none)


class AdminVariantOut(ORMModel):
    id: int
    product_id: int
    volume_ml: int
    sku: str | None
    stock: int
    retail_price: Money
    wholesale_price: Money | None
    bulk_price: Money | None
    photo_url: str | None
    is_active: bool


# ---------- Products ----------


class ProductIn(BaseModel):
    brand_id: int
    name: str = Field(min_length=1, max_length=255)
    type: str | None = Field(default=None, max_length=32)
    category: str | None = Field(default=None, max_length=128)
    gender: Gender | None = None
    longevity: str | None = Field(default=None, max_length=64)
    top_notes: str | None = None
    mid_notes: str | None = None
    base_notes: str | None = None
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=1024)
    is_active: bool = True
    variants: list[VariantIn] = Field(default_factory=list)


class ProductUpdate(BaseModel):
    brand_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: str | None = Field(default=None, max_length=32)
    category: str | None = Field(default=None, max_length=128)
    gender: Gender | None = None
    longevity: str | None = Field(default=None, max_length=64)
    top_notes: str | None = None
    mid_notes: str | None = None
    base_notes: str | None = None
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=1024)
    is_active: bool | None = None


class AdminBrandBrief(ORMModel):
    id: int
    name: str


class AdminProductOut(ORMModel):
    id: int
    brand_id: int
    brand: AdminBrandBrief
    name: str
    type: str | None
    category: str | None
    gender: Gender | None
    longevity: str | None
    top_notes: str | None
    mid_notes: str | None
    base_notes: str | None
    description: str | None
    image_url: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    variants: list[AdminVariantOut]


# ---------- Users ----------


class AdminUserOut(UserOut):
    is_active: bool
    orders_count: int = 0


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Password
    role: UserRole = UserRole.retail
    full_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    company_name: str | None = Field(default=None, max_length=255)

    @field_validator("email")
    @classmethod
    def lower(cls, v: str) -> str:
        return v.strip().lower()


class AdminUserUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None
    full_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    company_name: str | None = Field(default=None, max_length=255)
    wholesale_requested: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


# ---------- Orders ----------


class AdminOrderOut(OrderOut):
    user_id: int | None
    user_email: str | None
    created_by_email: str | None
    admin_note: str | None


class AdminOrderBrief(ORMModel):
    id: int
    channel: OrderChannel
    status: OrderStatus
    total_amount: Money
    returned_amount: Money
    customer_role: str
    payment_method: PaymentMethod | None
    contact_name: str | None
    contact_phone: str | None
    user_email: str | None
    items_count: int
    created_at: datetime


class OrderStatusUpdate(BaseModel):
    status: OrderStatus | None = None
    admin_note: str | None = Field(default=None, max_length=5000)


class OrderItemQty(BaseModel):
    order_item_id: int
    quantity: int = Field(ge=0)


class OrderItemsEditIn(BaseModel):
    items: list[OrderItemQty] = Field(min_length=1, max_length=200)
    reason: str | None = Field(default=None, max_length=500)

    _blank = field_validator("reason", mode="before")(_blank_to_none)


class ReturnItemIn(BaseModel):
    order_item_id: int
    quantity: int = Field(ge=1)
    restock: bool = True


class ReturnIn(BaseModel):
    items: list[ReturnItemIn] = Field(min_length=1, max_length=200)
    refund_method: PaymentMethod | None = None
    reason: str | None = Field(default=None, max_length=1000)

    _blank = field_validator("reason", mode="before")(_blank_to_none)

    @field_validator("items")
    @classmethod
    def unique_items(cls, v: list[ReturnItemIn]) -> list[ReturnItemIn]:
        ids = [i.order_item_id for i in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Позиция указана несколько раз")
        return v


# ---------- Store sales ----------


class StoreSaleItemIn(BaseModel):
    variant_id: int
    quantity: int = Field(ge=1, le=10_000)
    discount_percent: Decimal = Field(default=Decimal(0), ge=0, le=100, decimal_places=2)


class StoreSaleIn(BaseModel):
    items: list[StoreSaleItemIn] = Field(min_length=1, max_length=200)
    # None => the linked customer's best tier, or retail for an anonymous buyer.
    price_tier: PriceTier | None = None
    customer_id: int | None = None
    customer_name: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=64)
    payment_method: PaymentMethod = PaymentMethod.cash
    comment: str | None = Field(default=None, max_length=2000)

    _blank = field_validator("customer_name", "customer_phone", "comment", mode="before")(
        _blank_to_none
    )

    @field_validator("items")
    @classmethod
    def unique_variants(cls, v: list[StoreSaleItemIn]) -> list[StoreSaleItemIn]:
        ids = [i.variant_id for i in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Один и тот же вариант товара указан несколько раз")
        return v


class StoreQuoteIn(StoreSaleIn):
    # The draft receipt may be empty while the admin is still scanning.
    items: list[StoreSaleItemIn] = Field(default_factory=list, max_length=200)


class StoreQuoteLine(BaseModel):
    variant_id: int
    product_id: int
    brand_name: str
    product_name: str
    volume_ml: int
    sku: str | None
    image_url: str | None
    quantity: int
    stock: int
    available: bool
    list_price: Money
    discount_percent: float
    unit_price: Money
    line_total: Money


class StoreQuoteOut(BaseModel):
    price_tier: PriceTier
    max_discount_percent: float
    lines: list[StoreQuoteLine]
    unavailable_variant_ids: list[int]
    subtotal: Money
    discount_total: Money
    total: Money
    errors: list[str]
    can_submit: bool


class VariantSearchItem(BaseModel):
    variant_id: int
    product_id: int
    brand_name: str
    product_name: str
    volume_ml: int
    sku: str | None
    image_url: str | None
    stock: int
    retail_price: Money
    wholesale_price: Money | None
    bulk_price: Money | None
    product_active: bool


class StockMovementOut(ORMModel):
    id: int
    variant_id: int
    volume_ml: int
    delta: int
    stock_after: int
    reason: StockReason
    order_id: int | None
    user_email: str | None
    note: str | None
    created_at: datetime


# ---------- Pricing settings ----------


class PricingSettingsIO(ORMModel):
    mode: PricingMode
    wholesale_min_order_amount: MoneyIn
    bulk_min_order_amount: MoneyIn
    wholesale_min_item_qty: int = Field(ge=1)
    bulk_min_item_qty: int = Field(ge=1)
    max_store_discount_percent: Decimal = Field(default=Decimal(10), ge=0, le=100)
    show_next_tier: bool = True
    next_tier_terms: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def bulk_not_below_wholesale(self):
        if self.bulk_min_order_amount < self.wholesale_min_order_amount:
            raise ValueError("Порог крупного опта по сумме должен быть не ниже порога опта")
        if self.bulk_min_item_qty < self.wholesale_min_item_qty:
            raise ValueError("Порог крупного опта по количеству должен быть не ниже порога опта")
        return self


class PricingSettingsOut(BaseModel):
    mode: PricingMode
    wholesale_min_order_amount: Money
    bulk_min_order_amount: Money
    wholesale_min_item_qty: int
    bulk_min_item_qty: int
    max_store_discount_percent: float
    show_next_tier: bool
    next_tier_terms: str | None
    updated_at: datetime


# ---------- Import / uploads / stats ----------


class ImportRowError(BaseModel):
    row: int
    error: str


class ImportReport(BaseModel):
    dry_run: bool
    rows_total: int
    rows_skipped: int
    brands_created: int
    products_created: int
    products_updated: int
    variants_created: int
    variants_updated: int
    errors: list[ImportRowError]
    unmapped_columns: list[str]


class UploadOut(BaseModel):
    url: str


class StatsOut(BaseModel):
    users_by_role: dict[str, int]
    wholesale_requests: int
    orders_by_status: dict[str, int]
    # Net of refunds.
    revenue_total: Money
    refunds_total: Money
    revenue_by_channel: dict[str, Money]
    store_sales_today: int
    store_revenue_today: Money
    products_total: int
    products_without_variants: int
    variants_low_stock: int
    brands_total: int
