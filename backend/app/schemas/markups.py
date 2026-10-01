from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import Money
from app.services.markups import Markups, order_error


class PriceGroupIn(BaseModel):
    """A markup group: percent on the cost of each price level."""

    name: str = Field(min_length=1, max_length=64)
    retail: int = Field(ge=0, le=1000)
    wholesale: int = Field(ge=0, le=1000)
    bulk: int = Field(ge=0, le=1000)

    @field_validator("name")
    @classmethod
    def strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Укажите название группы")
        return v

    @model_validator(mode="after")
    def ordered(self):
        error = order_error(self.markups)
        if error:
            raise ValueError(error)
        return self

    @property
    def markups(self) -> Markups:
        return Markups(self.retail, self.wholesale, self.bulk)


class PriceGroupOut(BaseModel):
    id: int
    name: str
    retail: int
    wholesale: int
    bulk: int
    is_default: bool
    brand_count: int = 0


class BrandGroupOut(BaseModel):
    id: int
    name: str
    product_count: int = 0
    # The brand's group; brands without one are shown in the default group.
    group_id: int


class MarkupsOut(BaseModel):
    groups: list[PriceGroupOut]
    brands: list[BrandGroupOut]


class BrandMove(BaseModel):
    brand_id: int
    group_id: int


class AssignIn(BaseModel):
    brands: list[BrandMove] = Field(min_length=1, max_length=2000)


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
    # Volumes whose prices change; of them, retail price up / down; the average change of the
    # retail price, percent.
    changed: int
    raised: int
    lowered: int
    avg_change: float | None = None
    # Volumes left as they are: prices already right, «Цена вручную», no cost.
    unchanged: int
    locked: int
    no_cost: int
    # The largest changes of the retail price first, at most LINES_LIMIT.
    lines: list[RepriceLine]
