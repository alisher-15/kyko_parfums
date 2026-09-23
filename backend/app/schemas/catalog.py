from pydantic import BaseModel

from app.models import Gender, PriceTier, PricingMode, UserRole
from app.schemas.common import Money, ORMModel


class BrandBrief(ORMModel):
    id: int
    name: str


class BrandOut(ORMModel):
    id: int
    name: str
    logo_url: str | None
    description: str | None
    product_count: int = 0


class VariantPublic(BaseModel):
    id: int
    volume_ml: int
    sku: str | None
    stock: int
    photo_url: str | None
    # Best price available to the current user's role (before thresholds are checked).
    price: Money
    price_tier: PriceTier
    retail_price: Money
    # Only filled for roles allowed to see them.
    wholesale_price: Money | None = None
    bulk_price: Money | None = None


class ProductListItem(BaseModel):
    id: int
    name: str
    brand: BrandBrief
    type: str | None
    category: str | None
    gender: Gender | None
    longevity: str | None
    image_url: str | None
    min_price: Money | None
    volumes: list[int]
    in_stock: bool


class ProductDetail(ProductListItem):
    top_notes: str | None
    mid_notes: str | None
    base_notes: str | None
    description: str | None
    variants: list[VariantPublic]


class FilterBrand(BaseModel):
    id: int
    name: str
    product_count: int


class FiltersOut(BaseModel):
    brands: list[FilterBrand]
    genders: list[Gender]
    categories: list[str]
    types: list[str]
    price_min: Money | None
    price_max: Money | None


class PricingRulesOut(BaseModel):
    mode: PricingMode
    role: UserRole | None
    max_tier: PriceTier
    visible_tiers: list[PriceTier]
    wholesale_min_order_amount: Money | None = None
    bulk_min_order_amount: Money | None = None
    wholesale_min_item_qty: int | None = None
    bulk_min_item_qty: int | None = None
