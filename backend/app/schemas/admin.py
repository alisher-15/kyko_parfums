from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models import Gender, OrderStatus, PricingMode, UserRole
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
    user_id: int
    user_email: str
    admin_note: str | None


class AdminOrderBrief(ORMModel):
    id: int
    status: OrderStatus
    total_amount: Money
    customer_role: str
    contact_name: str
    contact_phone: str
    user_email: str
    items_count: int
    created_at: datetime


class OrderStatusUpdate(BaseModel):
    status: OrderStatus | None = None
    admin_note: str | None = Field(default=None, max_length=5000)


# ---------- Pricing settings ----------


class PricingSettingsIO(ORMModel):
    mode: PricingMode
    wholesale_min_order_amount: MoneyIn
    bulk_min_order_amount: MoneyIn
    wholesale_min_item_qty: int = Field(ge=1)
    bulk_min_item_qty: int = Field(ge=1)

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
    revenue_total: Money
    products_total: int
    products_without_variants: int
    variants_low_stock: int
    brands_total: int
