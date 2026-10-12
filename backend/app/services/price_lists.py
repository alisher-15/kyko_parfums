"""Supplier price lists: the lines of each supplier's file format.

One format per supplier (``models.PriceFormat``):

* ``usd_1c`` — Канат's 1С «Прайс-лист»: a «Номенклатура» column, the price in dollars
  («Долларовая») and «ОПТ,ЦЕНА» in tenge; group headings are rows without a price.
* ``barcode_kzt`` — Эрик's list: «ШТРИХ - КОД», the name, «ПРИМ» (TEST = a tester) and «ОПТ» in
  tenge. The next column (cash, with a discount) is not used: the shop doesn't pay cash.

The price taken is the one in tenge. A line is known by its text (``line_key``), and by its
barcode where the list has one.
"""

from __future__ import annotations

import csv
import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any
from zipfile import BadZipFile

from openpyxl.utils.exceptions import InvalidFileException

from app.models import PriceFormat
from app.services.importer import read_cells

Rows = list[tuple[int, list[Any]]]

# Headings are looked for in the first rows only.
HEADER_ROWS = 40
NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


class PriceListError(ValueError):
    """The file is not a price list of the expected format."""


@dataclass(frozen=True)
class PriceLine:
    row: int
    text: str
    price: Decimal
    price_usd: Decimal | None = None
    barcode: str | None = None


def line_key(text: str) -> str:
    """A line's text with spaces and case evened out: the same line in the next price list."""
    return " ".join(unicodedata.normalize("NFKC", text).split()).casefold()[:512]


def _heading(value: Any) -> str:
    return "".join(str(value).split()).casefold()


def _text(cells: list[Any], col: int | None) -> str:
    if col is None or col >= len(cells) or cells[col] is None:
        return ""
    return " ".join(str(cells[col]).split())[:512]


def _amount(cells: list[Any], col: int | None) -> Decimal | None:
    """A positive number, or None: headings, notes and dates such as «15,,09» are not prices."""
    if col is None or col >= len(cells):
        return None
    value = cells[col]
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int | float | Decimal):
        number = Decimal(str(value))
    else:
        s = "".join(str(value).split())
        if not NUMBER.fullmatch(s):
            return None
        try:
            number = Decimal(s.replace(",", "."))
        except InvalidOperation:
            return None
    return number.quantize(Decimal("0.01")) if number > 0 else None


def _barcode(cells: list[Any], col: int) -> str | None:
    value = cells[col] if col < len(cells) else None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    digits = re.sub(r"\D", "", str(value)) if value is not None else ""
    return digits if 8 <= len(digits) <= 14 else None


def _find(rows: Rows, test: Callable[[str], bool]) -> tuple[int, int] | None:
    """(row index, column) of the first heading that passes `test`."""
    for i, (_, cells) in enumerate(rows[:HEADER_ROWS]):
        for j, value in enumerate(cells):
            if value is not None and test(_heading(value)):
                return i, j
    return None


def _usd_1c(rows: Rows) -> list[PriceLine]:
    name = _find(rows, lambda t: "номенклатура" in t)
    kzt = _find(rows, lambda t: t in {"опт,цена", "опт.цена", "оптцена"})
    if name is None or kzt is None:
        raise PriceListError("Это не прайс 1С: нет колонок «Номенклатура» и «ОПТ,ЦЕНА»")
    usd = _find(rows, lambda t: t == "долларовая")
    lines = []
    for row, cells in rows[max(name[0], kzt[0]) :]:
        text, price = _text(cells, name[1]), _amount(cells, kzt[1])
        if text and price is not None:
            usd_price = _amount(cells, usd[1]) if usd else None
            lines.append(PriceLine(row, text, price, usd_price))
    return lines


def _barcode_kzt(rows: Rows) -> list[PriceLine]:
    code = _find(rows, lambda t: t.startswith("штрих"))
    if code is None:
        raise PriceListError("Это не прайс со штрихкодами: нет колонки «ШТРИХ - КОД»")
    # The price: «ОПТ» right after «ПРИМ»; the first «ОПТ» otherwise.
    price_col = None
    note = _find(rows, lambda t: t == "прим")
    if note is not None:
        cells = rows[note[0]][1]
        if note[1] + 1 < len(cells) and _heading(cells[note[1] + 1] or "") == "опт":
            price_col = note[1] + 1
    if price_col is None:
        opt = _find(rows, lambda t: t == "опт")
        if opt is None:
            raise PriceListError("Это не прайс со штрихкодами: нет колонки «ОПТ»")
        price_col = opt[1]
    name_col = code[1] + 1
    lines = []
    for row, cells in rows[code[0] + 1 :]:
        text, price = _text(cells, name_col), _amount(cells, price_col)
        if text and price is not None:
            lines.append(PriceLine(row, text, price, barcode=_barcode(cells, code[1])))
    return lines


PARSERS: dict[PriceFormat, Callable[[Rows], list[PriceLine]]] = {
    PriceFormat.usd_1c: _usd_1c,
    PriceFormat.barcode_kzt: _barcode_kzt,
}


def read_price_list(fmt: PriceFormat, content: bytes, filename: str) -> list[PriceLine]:
    try:
        rows = read_cells(content, filename)
    except (BadZipFile, InvalidFileException, KeyError, OSError, UnicodeError, csv.Error) as e:
        raise PriceListError("Не удалось прочитать файл: нужен .xlsx или .csv") from e
    lines = PARSERS[fmt](rows)
    if not lines:
        raise PriceListError("В файле не нашлось строк с ценой")
    return lines
