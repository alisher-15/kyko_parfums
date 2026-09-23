from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

# Money is kept as Decimal internally and sent to clients as a JSON number.
Money = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]
MoneyIn = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class Message(BaseModel):
    detail: str
