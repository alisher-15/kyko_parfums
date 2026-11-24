from datetime import date, datetime

from pydantic import BaseModel

from app.models import CategoryKind, Gender, PriceTier, PricingMode, UserRole
from app.schemas.categories import CategoryBrief
from app.schemas.common import Money, ORMModel, Page


class BrandBrief(ORMModel):
    id: int
    name: str


class BrandOut(ORMModel):
    id: int
    name: str
    logo_url: str | None
    description: str | None
    product_count: int = 0
    # In the running line of brands on the home page.
    is_top: bool = False

    @classmethod
    def of(cls, brand, product_count: int) -> "BrandOut":
        return cls(
            id=brand.id,
            name=brand.name,
            logo_url=brand.logo_url,
            description=brand.description,
            product_count=product_count,
            is_top=brand.is_top,
        )


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


class TesterOffer(BaseModel):
    """A tester next to its bottle, at the prices this viewer pays (the home page's «Тестеры»)."""

    volume_ml: int
    price: Money
    bottle_price: Money


class ProductListItem(BaseModel):
    id: int
    name: str
    brand: BrandBrief
    # Where the product is in the catalog tree (GET /api/categories); null: not placed yet.
    category_id: int | None = None
    # The section's kind: perfumes have a concentration, notes, an olfactory group.
    kind: CategoryKind = CategoryKind.perfume
    type: str | None
    # The olfactory group («Цветочные»), not the catalog tree (category_id).
    category: str | None
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
    # The tester that saves this viewer the most against the bottle of the same volume.
    tester: TesterOffer | None = None
    # Units sold in the last POPULAR_DAYS days, only with sort=popular («Купили 41 раз»).
    sold: int | None = None


class ProductPage(Page[ProductListItem]):
    # Nothing has the searched words: these are the closest products (typos, odd spellings).
    similar: bool = False


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
    # Upsell: the level the customer can ask for, whether prices of it are shown, its terms.
    next_role: UserRole | None = None
    next_tier: PriceTier | None = None
    next_tier_terms: str | None = None


class SitemapProduct(BaseModel):
    id: int
    updated_at: datetime


class SitemapOut(BaseModel):
    """What sitemap.xml lists: the products on sale and their brands."""

    products: list[SitemapProduct]
    brand_ids: list[int]
