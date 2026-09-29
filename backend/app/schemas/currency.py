from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.common import Money


class CurrencyOut(BaseModel):
    """What the storefront needs: tenge per dollar, or None while no rate is known."""

    usd_rate: Money | None
    updated_at: datetime | None


class RateAdminOut(BaseModel):
    """The rate with its parts, for the admin panel."""

    effective_rate: Money | None
    source_rate: Money | None
    source_updated_at: datetime | None
    checked_at: datetime | None
    # Why the last read of mig.kz failed; None when it worked.
    source_error: str | None
    adjustment: Money
    manual_rate: Money | None


class RateIn(BaseModel):
    # Tenge added to the rate from mig.kz, up to 50 either way.
    adjustment: Decimal = Field(default=Decimal(0), ge=-50, le=50, decimal_places=2)
    # A rate typed by hand, kept only while mig.kz has given none (then mig.kz is used).
    manual_rate: Decimal | None = Field(default=None, gt=0, le=10_000, decimal_places=2)
