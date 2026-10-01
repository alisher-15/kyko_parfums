from pydantic import BaseModel, Field, model_validator

from app.schemas.common import Money
from app.services.markups import Markups, order_error


class BaseMarkupIn(BaseModel):
    """Base markup on the cost of each price level, percent."""

    retail: int = Field(ge=0, le=1000)
    wholesale: int = Field(ge=0, le=1000)
    bulk: int = Field(ge=0, le=1000)

    @model_validator(mode="after")
    def ordered(self):
        error = order_error(Markups(self.retail, self.wholesale, self.bulk))
        if error:
            raise ValueError(f"Базовая {error}")
        return self


class BrandMarkupIn(BaseModel):
    """Percent the brand adds to the base markup of each price level."""

    retail: int = Field(ge=0, le=100)
    wholesale: int = Field(ge=0, le=100)
    bulk: int = Field(ge=0, le=100)


class BrandMarkupOut(BrandMarkupIn):
    id: int
    name: str
    product_count: int = 0


class MarkupsOut(BaseModel):
    base: BaseMarkupIn
    brands: list[BrandMarkupOut]


class RepriceLine(BaseModel):
    variant_id: int
    product_id: int
    label: str
    cost_price: Money
    old_retail: Money
    old_wholesale: Money | None
    old_bulk: Money | None
    retail: Money
    wholesale: Money
    bulk: Money


class RepriceReport(BaseModel):
    dry_run: bool
    # Volumes whose prices change; of them, retail price up / down.
    changed: int
    raised: int
    lowered: int
    # Volumes left as they are: prices already right, «Цена вручную», no cost.
    unchanged: int
    locked: int
    no_cost: int
    # The largest changes of the retail price first, at most LINES_LIMIT.
    lines: list[RepriceLine]
