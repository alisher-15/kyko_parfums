"""Supplier price lists: the lines of each supplier's file format.

One format per supplier (``models.PriceFormat``):

* ``usd_1c`` — Канат's 1С «Прайс-лист»: a «Номенклатура» column, the price in dollars
  («Долларовая») and «ОПТ,ЦЕНА» in tenge; group headings are rows without a price.
* ``barcode_kzt`` — Эрик's list: «ШТРИХ - КОД», the name, «ПРИМ» (TEST = a tester, whose
  barcode is the bottle's) and «ОПТ» in tenge. The next column (cash, with a discount) is not
  used: the shop doesn't pay cash.

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
# «15.000», «1,250,000»: thousands groups (tenge have no third decimal digit).
THOUSANDS = re.compile(r"\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*")
# «12,500.50» / «12.500,50»: thousands and decimals.
GROUPED_DECIMAL = re.compile(r"\d{1,3}(?:([.,])\d{3})+(?!\1)[.,]\d{1,2}")
# What a price cell may say around the number.
CURRENCY = re.compile(r"₸|тг\.?|тенге|kzt|\$|usd", re.IGNORECASE)


class PriceListError(ValueError):
    """The file is not a price list of the expected format."""


@dataclass(frozen=True)
class PriceLine:
    row: int
    text: str
    price: Decimal
    price_usd: Decimal | None = None
    barcode: str | None = None
    # Marked as a tester («ПРИМ» TEST in Эрик's list): its barcode is the bottle's.
    tester: bool = False


@dataclass(frozen=True)
class Unreadable:
    """A line with something in its price cell that is not a price: it is left out, and said."""

    row: int
    text: str
    value: str


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
        number = _number_text(str(value))
        if number is None:
            return None
    return number.quantize(Decimal("0.01")) if number > 0 else None


def _number_text(value: str) -> Decimal | None:
    """«12 500 ₸», «15.000», «1 250,50 тг», «12,500.50»; None for anything else."""
    s = CURRENCY.sub("", "".join(value.split()))
    if THOUSANDS.fullmatch(s):
        s = s.replace(".", "").replace(",", "")
    elif GROUPED_DECIMAL.fullmatch(s):
        decimal_mark = s[-3] if s[-3] in ".," else s[-2]
        whole, frac = s[: s.rindex(decimal_mark)], s[s.rindex(decimal_mark) + 1 :]
        s = whole.replace(".", "").replace(",", "") + "." + frac
    elif NUMBER.fullmatch(s):
        s = s.replace(",", ".")
    else:
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _unreadable(cells: list[Any], col: int | None) -> str | None:
    """The price cell's text when it has digits but is not a price («12 500 тг опт», «1/2»)."""
    if col is None or col >= len(cells) or cells[col] is None or isinstance(cells[col], bool):
        return None
    if isinstance(cells[col], int | float | Decimal):
        return None  # a number: zero or below is no price, not a misreading
    text = " ".join(str(cells[col]).split())
    return text[:64] if re.search(r"\d", text) else None


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


def _usd_1c(rows: Rows, skipped: list[Unreadable]) -> list[PriceLine]:
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
        elif text and (value := _unreadable(cells, kzt[1])):
            skipped.append(Unreadable(row, text, value))
    return lines


def _barcode_kzt(rows: Rows, skipped: list[Unreadable]) -> list[PriceLine]:
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
    note_col = note[1] if note is not None else None
    lines = []
    for row, cells in rows[code[0] + 1 :]:
        text, price = _text(cells, name_col), _amount(cells, price_col)
        if text and price is not None:
            tester = _heading(_text(cells, note_col)).startswith(("test", "тест"))
            lines.append(
                PriceLine(row, text, price, barcode=_barcode(cells, code[1]), tester=tester)
            )
        elif text and (value := _unreadable(cells, price_col)):
            skipped.append(Unreadable(row, text, value))
    return lines


PARSERS: dict[PriceFormat, Callable[[Rows, list[Unreadable]], list[PriceLine]]] = {
    PriceFormat.usd_1c: _usd_1c,
    PriceFormat.barcode_kzt: _barcode_kzt,
}


def read_price_list(fmt: PriceFormat, content: bytes, filename: str) -> list[PriceLine]:
    return read_price_list_with_skips(fmt, content, filename)[0]


def read_price_list_with_skips(
    fmt: PriceFormat, content: bytes, filename: str
) -> tuple[list[PriceLine], list[Unreadable]]:
    """The lines with a price, and the lines whose price cell could not be read."""
    try:
        rows = read_cells(content, filename)
    except (BadZipFile, InvalidFileException, KeyError, OSError, UnicodeError, csv.Error) as e:
        raise PriceListError("Не удалось прочитать файл: нужен .xlsx или .csv") from e
    skipped: list[Unreadable] = []
    lines = PARSERS[fmt](rows, skipped)
    if not lines:
        raise PriceListError("В файле не нашлось строк с ценой")
    return lines, skipped
