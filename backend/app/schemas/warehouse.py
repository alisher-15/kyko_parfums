from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models import DocumentStatus
from app.schemas.common import Money, MoneyIn, ORMModel


def _blank_to_none(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


class BarcodeIn(BaseModel):
    code: str = Field(min_length=1, max_length=64)


class ScanIn(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    quantity: int = Field(default=1, ge=1, le=100_000)


# ---------- Receipts ----------


class ReceiptIn(BaseModel):
    supplier: str | None = Field(default=None, max_length=255)
    number: str | None = Field(default=None, max_length=64)
    note: str | None = None

    _blank = field_validator("supplier", "number", "note", mode="before")(_blank_to_none)


class ReceiptLineIn(BaseModel):
    variant_id: int
    quantity: int = Field(default=1, ge=1, le=100_000)
    cost_price: MoneyIn | None = None


class ReceiptLineUpdate(BaseModel):
    quantity: int | None = Field(default=None, ge=1, le=100_000)
    # null clears the price.
    cost_price: MoneyIn | None = None


class ReceiptLineOut(ORMModel):
    id: int
    variant_id: int | None
    label: str
    sku: str | None = None
    quantity: int
    cost_price: Money | None
    # Stock and average cost of the volume now (drafts) — to compare with the new price.
    stock: int | None = None
    current_cost: Money | None = None


class ReceiptBrief(ORMModel):
    id: int
    status: DocumentStatus
    supplier: str | None
    number: str | None
    total_quantity: int
    total_cost: Money
    lines: int
    created_at: datetime
    posted_at: datetime | None


class ReceiptOut(ReceiptBrief):
    note: str | None
    created_by_email: str | None
    posted_by_email: str | None
    items: list[ReceiptLineOut]
    # The line the last scan/addition touched, for highlighting.
    touched_line_id: int | None = None


# ---------- Stock counts ----------


class CountIn(BaseModel):
    note: str | None = None

    _blank = field_validator("note", mode="before")(_blank_to_none)


class CountLineIn(BaseModel):
    variant_id: int
    # Added to the counted quantity; 0 records "not found on the shelf".
    quantity: int = Field(default=1, ge=0, le=100_000)


class CountLineUpdate(BaseModel):
    counted: int = Field(ge=0, le=100_000)


class CountLineOut(ORMModel):
    id: int
    variant_id: int | None
    label: str
    sku: str | None = None
    counted: int
    # What should be on the shelf: free stock plus units set aside for orders not shipped yet.
    # Drafts: as of now. Posted: at posting.
    expected: int | None
    # Drafts: units in orders not shipped yet (part of `expected`, not for sale).
    reserved: int | None = None


class CountBrief(ORMModel):
    id: int
    status: DocumentStatus
    note: str | None
    lines: int
    difference: int  # sum of (counted - expected)
    created_at: datetime
    posted_at: datetime | None


class CountOut(CountBrief):
    created_by_email: str | None
    posted_by_email: str | None
    items: list[CountLineOut]
    touched_line_id: int | None = None
