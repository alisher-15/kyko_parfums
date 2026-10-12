from datetime import datetime

from pydantic import BaseModel, Field

from app.models import PriceFormat
from app.schemas.common import Money


class PriceListOut(BaseModel):
    id: int
    file_name: str
    uploaded_at: datetime
    user_email: str | None = None
    lines: int
    matched: int
    unmatched: int


class SupplierOut(BaseModel):
    id: int
    name: str
    is_main: bool
    price_format: PriceFormat
    # Volumes with a price from this supplier; lines linked to a volume; lines «не наш товар».
    prices: int = 0
    links: int = 0
    ignored: int = 0
    last_list: PriceListOut | None = None


class UnmatchedLine(BaseModel):
    row: int
    line: str
    price: Money
    barcode: str | None = None


class PriceChangeLine(BaseModel):
    variant_id: int
    product_id: int
    label: str
    line: str
    supplier_old: Money | None
    supplier_new: Money
    cost_old: Money | None
    cost_new: Money | None
    retail_old: Money
    retail_new: Money
    wholesale_old: Money | None
    wholesale_new: Money | None
    bulk_old: Money | None
    bulk_new: Money | None


class PriceListReport(BaseModel):
    dry_run: bool
    # Lines with a price; matched to a volume (of them by barcode); «не наш товар»; lines naming
    # a volume another line of the list already named (the higher price is taken).
    lines: int
    matched: int
    by_barcode: int
    ignored: int
    duplicates: int
    unmatched: list[UnmatchedLine]
    # The supplier's price: volumes that got one for the first time, went up, went down.
    supplier_new: int
    supplier_up: int
    supplier_down: int
    # The cost of the volume: up, down.
    cost_up: int
    cost_down: int
    # Volumes whose prices go up; whose cost went down while the prices stay; whose first cost
    # makes them remember the markups of their prices.
    prices_raised: int
    prices_kept: int
    remembered: int
    # Another supplier's list before the main supplier's first one: costs are left as they are.
    waiting_for_main: bool = False
    # Price changes first, then the largest cost changes; at most CHANGES_LIMIT.
    changes: list[PriceChangeLine]


class LinkIn(BaseModel):
    line: str = Field(min_length=1, max_length=512)
    # None: the line is «не наш товар».
    variant_id: int | None = None


class LinkOut(BaseModel):
    line: str
    variant_id: int | None


class LinkProblem(BaseModel):
    row: int
    line: str
    error: str


class LinksReport(BaseModel):
    dry_run: bool
    rows: int
    linked: int
    ignored: int
    problems: list[LinkProblem]


class VariantSupplierPrice(BaseModel):
    variant_id: int
    supplier_id: int
    supplier: str
    is_main: bool
    price: Money
    price_usd: Money | None
    line: str
    updated_at: datetime
    # The price comes from the supplier's latest price list (otherwise the line was not in it).
    latest: bool
