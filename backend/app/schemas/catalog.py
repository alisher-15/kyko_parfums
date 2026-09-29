from datetime import date

from pydantic import BaseModel

from app.models import CategoryKind, Gender, PriceTier, PricingMode, UserRole
from app.schemas.categories import CategoryBrief
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


class DealOut(BaseModel):
    """A promotion that lowers the price the viewer pays."""

    promotion_id: int
    title: str
    # Percent off the retail price.
    discount_percent: float
    ends_on: date | None = None


class VariantPublic(BaseModel):
    id: int
    volume_ml: int
    # The same perfume in plain packaging, with its own prices (see ProductVariant.is_tester).
    is_tester: bool = False
    sku: str | None
    # Only when few units are left ("Осталось мало"); otherwise None: see availability.py.
    stock: int | None
    photo_url: str | None
    # Best price available to the current user's role (before thresholds are checked).
    price: Money
    price_tier: PriceTier
    retail_price: Money
    # Only filled for roles allowed to see them.
    wholesale_price: Money | None = None
    bulk_price: Money | None = None
    # Upsell teaser: the price of the next level (bulk for wholesale customers), if cheaper.
    next_tier: PriceTier | None = None
    next_tier_price: Money | None = None
    # Set when `price` is a promotion price.
    deal: DealOut | None = None


class ProductListItem(BaseModel):
    id: int
    name: str
    brand: BrandBrief
    # Perfume or cosmetics: which fields and filters make sense (the section's kind).
    kind: CategoryKind
    # The node of the catalog tree the product is in («Губы»).
    category: CategoryBrief | None
    # Perfumes: concentration (EDP, EDT…) and olfactory group.
    type: str | None
    olfactory_group: str | None
    gender: Gender | None
    longevity: str | None
    image_url: str | None
    # The cheapest variant the viewer can buy, testers included.
    min_price: Money | None
    # Distinct volumes (a bottle and a tester of the same size count once).
    volumes: list[int]
    # Marked «Новинка» by an admin.
    is_new: bool = False
    # A running promotion lowers a price this viewer pays (the badge "−15%").
    deal: DealOut | None = None


class ProductDetail(ProductListItem):
    # From the section down to the product's node, for the breadcrumbs.
    category_path: list[CategoryBrief] = []
    top_notes: str | None
    mid_notes: str | None
    base_notes: str | None
    description: str | None
    variants: list[VariantPublic]


class PromotionPublic(ORMModel):
    id: int
    title: str
    description: str | None
    image_url: str | None
    image_only: bool
    discount_percent: float | None
    starts_on: date | None
    ends_on: date | None


class FilterBrand(BaseModel):
    id: int
    name: str
    product_count: int


class FiltersOut(BaseModel):
    brands: list[FilterBrand]
    genders: list[Gender]
    olfactory_groups: list[str]
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
    # Upsell: the level the customer can ask for, whether prices of it are shown, its terms.
    next_role: UserRole | None = None
    next_tier: PriceTier | None = None
    next_tier_terms: str | None = None
