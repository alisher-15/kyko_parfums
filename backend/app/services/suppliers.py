"""Suppliers' prices and the cost of a volume.

An uploaded price list (``price_lists.read_price_list``) is matched to volumes line by line: a
line linked before (``SupplierLink``: by its text; a link without a volume is «не наш товар»),
else its barcode. Its prices become the supplier's prices of those volumes (``SupplierPrice``).

The cost of a volume is the main supplier's price (Канат), or the lowest other one where the main
supplier has none (Эрик). When a price list changes a volume's cost, its prices follow the
markups it remembers (``services/markups.py``): cost × (1 + markup), rounded up to whole hundreds
of tenge. **A price never goes down**: when the new cost gives a lower price, the old price stays
(the cost itself is the new, lower one). A volume that had no cost remembers the markups of its
current prices, which stay as they are. Until the main supplier's first price list, the others'
lists only store their prices.
"""

from __future__ import annotations

import io
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal
from typing import Any

from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    PriceFormat,
    Product,
    ProductVariant,
    Supplier,
    SupplierLink,
    SupplierPrice,
    SupplierPriceList,
    User,
    VariantBarcode,
)
from app.schemas.admin import check_price_order
from app.services import markups
from app.services.barcodes import candidates
from app.services.importer import (
    _norm_header,
    _text,
    parse_bool,
    parse_int,
    parse_tester,
    product_key,
    products_by_key,
    read_cells,
    strip_tester,
)
from app.services.price_lists import PriceLine, line_key

PRICE_STEP = Decimal(100)

Prices = tuple[Decimal, Decimal | None, Decimal | None]


def price_from_cost(cost: Decimal, markup: Decimal) -> Decimal:
    """cost × (1 + markup / 100) in whole tenge, rounded up to hundreds."""
    price = (cost * (100 + markup) / 100).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return (price / PRICE_STEP).to_integral_value(rounding=ROUND_CEILING) * PRICE_STEP


def raised(old: Decimal | None, cost: Decimal, markup: Decimal | None) -> Decimal | None:
    """The price for a new cost: by the markup, but never below the old price."""
    if markup is None or old is None:
        return old
    return max(old, price_from_cost(cost, markup))


def main_supplier_id(db: Session) -> int | None:
    return db.scalar(select(Supplier.id).where(Supplier.is_main))


def cost_of(prices: Mapping[int, Decimal], main_id: int | None) -> Decimal | None:
    """A volume's cost from its suppliers' prices: the main one's, else the lowest other one."""
    if main_id is not None and main_id in prices:
        return prices[main_id]
    return min(prices.values(), default=None)


# ---------- Matching ----------


@dataclass
class LineMatch:
    line: PriceLine
    variant: ProductVariant | None = None
    # "link" or "barcode" when matched.
    by: str | None = None
    # Linked as «не наш товар».
    ignored: bool = False


def match_lines(
    db: Session, supplier: Supplier, lines: Iterable[PriceLine], lock: bool = False
) -> list[LineMatch]:
    lines = list(lines)
    links = {
        link.key: link.variant_id
        for link in db.scalars(select(SupplierLink).where(SupplierLink.supplier_id == supplier.id))
    }
    by_code: dict[str, int] = {}
    if supplier.price_format == PriceFormat.barcode_kzt:
        codes = {c for line in lines if line.barcode for c in candidates(line.barcode)}
        if codes:
            rows = db.execute(
                select(VariantBarcode.code, VariantBarcode.variant_id).where(
                    VariantBarcode.code.in_(codes)
                )
            )
            by_code = {code: variant_id for code, variant_id in rows.all()}

    # (line, volume id, matched by, «не наш товар»)
    found: list[tuple[PriceLine, int | None, str | None, bool]] = []
    for line in lines:
        key = line_key(line.text)
        if key in links:
            found.append((line, links[key], "link", links[key] is None))
            continue
        codes = candidates(line.barcode) if line.barcode else []
        variant_id = next((by_code[c] for c in codes if c in by_code), None)
        found.append((line, variant_id, "barcode" if variant_id else None, False))

    ids = {variant_id for _, variant_id, _, _ in found if variant_id is not None}
    stmt = (
        select(ProductVariant)
        .where(ProductVariant.id.in_(ids))
        .options(joinedload(ProductVariant.product).joinedload(Product.brand))
    )
    if lock:
        stmt = stmt.with_for_update(of=ProductVariant)
    variants = {v.id: v for v in db.scalars(stmt).unique()}
    return [
        LineMatch(line, variants.get(variant_id) if variant_id else None, by, ignored)
        for line, variant_id, by, ignored in found
    ]


# ---------- Planning and applying ----------


@dataclass
class Change:
    variant: ProductVariant
    line: str
    supplier_old: Decimal | None
    supplier_new: Decimal
    cost_old: Decimal | None
    cost_new: Decimal | None
    prices_old: Prices
    prices_new: Prices
    # The volume gets its first cost: it remembers the markups of its current prices.
    remember: bool = False


@dataclass
class Plan:
    matches: list[LineMatch]
    # The price of each matched volume in this list (the higher one if two lines name it).
    prices: dict[int, PriceLine] = field(default_factory=dict)
    duplicates: int = 0
    changes: list[Change] = field(default_factory=list)
    # Another supplier's list before the main supplier's first one: its prices are kept, costs
    # wait for the main list (else Эрик's price would stand for every volume Канат also has).
    waiting_for_main: bool = False


def plan_price_list(
    db: Session, supplier: Supplier, lines: Iterable[PriceLine], lock: bool = False
) -> Plan:
    """What a price list changes. ``lock``: it is going to be applied, lock the volumes."""
    plan = Plan(match_lines(db, supplier, lines, lock=lock))
    variants: dict[int, ProductVariant] = {}
    for m in plan.matches:
        if m.variant is None:
            continue
        variants[m.variant.id] = m.variant
        before = plan.prices.get(m.variant.id)
        if before is not None:
            plan.duplicates += 1
            if before.price >= m.line.price:
                continue
        plan.prices[m.variant.id] = m.line

    known: dict[int, dict[int, Decimal]] = defaultdict(dict)
    for sp in db.scalars(
        select(SupplierPrice).where(SupplierPrice.variant_id.in_(list(plan.prices)))
    ):
        known[sp.variant_id][sp.supplier_id] = sp.price
    main_id = main_supplier_id(db)
    plan.waiting_for_main = (
        main_id is not None
        and supplier.id != main_id
        and db.scalar(
            select(SupplierPriceList.id).where(SupplierPriceList.supplier_id == main_id).limit(1)
        )
        is None
    )

    for variant_id, line in plan.prices.items():
        v = variants[variant_id]
        supplier_old = known[variant_id].get(supplier.id)
        cost_new = (
            v.cost_price
            if plan.waiting_for_main
            else cost_of({**known[variant_id], supplier.id: line.price}, main_id)
        )
        prices_old: Prices = (v.retail_price, v.wholesale_price, v.bulk_price)
        prices_new = prices_old
        remember = False
        if cost_new is not None and cost_new != v.cost_price:
            levels = (v.retail_markup, v.wholesale_markup, v.bulk_markup)
            if all(m is None for m in levels):
                remember = True
            else:
                candidate = tuple(
                    raised(p, cost_new, m) for p, m in zip(prices_old, levels, strict=True)
                )
                try:
                    check_price_order(*candidate)
                    prices_new = candidate  # type: ignore[assignment]
                except ValueError:
                    pass  # odd prices set by hand: leave them to the admin
        if (
            supplier_old != line.price
            or cost_new != v.cost_price
            or prices_new != prices_old
            or remember
        ):
            plan.changes.append(
                Change(
                    variant=v,
                    line=line.text,
                    supplier_old=supplier_old,
                    supplier_new=line.price,
                    cost_old=v.cost_price,
                    cost_new=cost_new,
                    prices_old=prices_old,
                    prices_new=prices_new,
                    remember=remember,
                )
            )
    return plan


def apply_price_list(
    db: Session, supplier: Supplier, plan: Plan, file_name: str, user: User | None
) -> SupplierPriceList:
    """Store the supplier's prices and the new costs and prices; the caller commits."""
    matched = sum(1 for m in plan.matches if m.variant is not None)
    ignored = sum(1 for m in plan.matches if m.ignored)
    price_list = SupplierPriceList(
        supplier_id=supplier.id,
        file_name=file_name[:255],
        user_id=user.id if user else None,
        lines=len(plan.matches),
        matched=matched,
        unmatched=len(plan.matches) - matched - ignored,
    )
    db.add(price_list)
    db.flush()
    stored = {
        sp.variant_id: sp
        for sp in db.scalars(
            select(SupplierPrice).where(
                SupplierPrice.supplier_id == supplier.id,
                SupplierPrice.variant_id.in_(list(plan.prices)),
            )
        )
    }
    now = datetime.now(UTC)
    for variant_id, line in plan.prices.items():
        sp = stored.get(variant_id)
        if sp is None:
            sp = SupplierPrice(supplier_id=supplier.id, variant_id=variant_id)
            db.add(sp)
        sp.price, sp.price_usd, sp.line = line.price, line.price_usd, line.text
        sp.price_list_id, sp.updated_at = price_list.id, now
    for c in plan.changes:
        v = c.variant
        v.cost_price = c.cost_new
        v.retail_price, v.wholesale_price, v.bulk_price = c.prices_new
        if c.remember:
            markups.remember(v)
    return price_list


# ---------- Links ----------


def links_by_key(db: Session, supplier: Supplier) -> dict[str, SupplierLink]:
    """All of a supplier's links in one query: a links file has thousands of rows."""
    stmt = select(SupplierLink).where(SupplierLink.supplier_id == supplier.id)
    return {link.key: link for link in db.scalars(stmt)}


def link_line(
    db: Session,
    supplier: Supplier,
    line: str,
    variant_id: int | None,
    known: dict[str, SupplierLink] | None = None,
) -> SupplierLink:
    """Remember which volume a price list line is (None: not ours); the caller commits.
    `known` is the supplier's links from ``links_by_key``; new links are added to it."""
    key = line_key(line)
    if known is None:
        link = db.scalar(
            select(SupplierLink).where(
                SupplierLink.supplier_id == supplier.id, SupplierLink.key == key
            )
        )
    else:
        link = known.get(key)
    if link is None:
        link = SupplierLink(supplier_id=supplier.id, key=key)
        db.add(link)
        if known is not None:
            known[key] = link
    link.line = " ".join(line.split())[:512]
    link.variant_id = variant_id
    return link


LINK_COLUMNS = [
    ("line", "Строка прайса"),
    ("brand", "Бренд"),
    ("name", "Название"),
    ("type", "Тип"),
    ("volume_ml", "Объём, мл"),
    ("is_tester", "Тестер"),
    ("ignored", "Не наш товар"),
]
LINK_ALIASES = {
    "line": {"строка прайса", "строка", "наименование в прайсе", "line"},
    "brand": {"бренд", "brand"},
    "name": {"название", "name"},
    "type": {"тип", "type"},
    "volume_ml": {"объем мл", "объем", "volume_ml", "volume"},
    "is_tester": {"тестер", "tester", "is_tester"},
    "ignored": {"не наш товар", "ignored"},
}


def export_links(db: Session, supplier: Supplier) -> bytes:
    links = db.scalars(
        select(SupplierLink)
        .where(SupplierLink.supplier_id == supplier.id)
        .options(
            joinedload(SupplierLink.variant)
            .joinedload(ProductVariant.product)
            .joinedload(Product.brand)
        )
        .order_by(SupplierLink.line)
    ).unique()
    wb = Workbook()
    ws = wb.active
    ws.title = "Сопоставление"
    ws.append([title for _, title in LINK_COLUMNS])
    for link in links:
        v = link.variant
        if v is None:
            ws.append([link.line, None, None, None, None, None, "да"])
        else:
            p = v.product
            tester = "да" if v.is_tester else "нет"
            ws.append([link.line, p.brand.name, p.name, p.type, v.volume_ml, tester, None])
    ws.freeze_panes = "B2"
    for col, width in zip("ABCDEFG", (70, 22, 34, 10, 10, 8, 13), strict=True):
        ws.column_dimensions[col].width = width
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@dataclass
class LinksResult:
    rows: int = 0
    linked: int = 0
    ignored: int = 0
    # (row, line, why) of the rows not taken.
    problems: list[tuple[int, str, str]] = field(default_factory=list)


def import_links(db: Session, supplier: Supplier, content: bytes, filename: str) -> LinksResult:
    """Links from a file: the price list line and the product (brand, name, type, volume, tester)
    or «Не наш товар». The caller commits or rolls back."""
    rows = read_cells(content, filename)
    columns: dict[str, int] = {}
    start = None
    for i, (_, cells) in enumerate(rows[:15]):
        found = {
            key: j
            for j, cell in enumerate(cells)
            for key, aliases in LINK_ALIASES.items()
            if cell is not None and _norm_header(cell) in aliases
        }
        if "line" in found:
            columns, start = found, i + 1
            break
    if start is None:
        raise ValueError("Не найдена колонка «Строка прайса»")

    def cell(cells: list[Any], key: str) -> Any:
        j = columns.get(key)
        return cells[j] if j is not None and j < len(cells) else None

    products = products_by_key(db)
    known = links_by_key(db, supplier)
    result = LinksResult()
    for row, cells in rows[start:]:
        line = _text(cell(cells, "line"), 512)
        if not line:
            continue
        result.rows += 1
        try:
            ignored = bool(parse_bool(cell(cells, "ignored")))
        except ValueError:
            ignored = False
        if ignored:
            link_line(db, supplier, line, None, known)
            result.ignored += 1
            continue
        raw_name, tester_in_name = strip_tester(cell(cells, "name"))
        raw_type, tester_in_type = strip_tester(cell(cells, "type"))
        raw_volume, tester_in_volume = strip_tester(cell(cells, "volume_ml"))
        try:
            tester = parse_tester(cell(cells, "is_tester"))
            volume = parse_int(raw_volume)
        except ValueError as e:
            result.problems.append((row, line, str(e)))
            continue
        if tester is None:
            tester = tester_in_name or tester_in_type or tester_in_volume
        product = products.get(product_key(cell(cells, "brand"), raw_name, raw_type))
        if product is None:
            result.problems.append((row, line, "нет такого товара на сайте"))
            continue
        variant = next(
            (v for v in product.variants if v.volume_ml == volume and v.is_tester == tester),
            None,
        )
        if variant is None:
            result.problems.append((row, line, "у товара нет такого объёма"))
            continue
        link_line(db, supplier, line, variant.id, known)
        result.linked += 1
    return result
