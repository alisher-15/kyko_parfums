"""Warehouse: barcodes, stock receipts (приёмка) and stock counts (инвентаризация).

Both documents are drafts while they are filled by scanning; posting changes the stock.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db import get_db
from app.deps import require_admin
from app.models import (
    DocumentStatus,
    Product,
    ProductVariant,
    StockCount,
    StockCountItem,
    StockReceipt,
    StockReceiptItem,
    User,
)
from app.routers.admin.store import variant_item
from app.schemas.admin import AdminVariantOut, VariantSearchItem
from app.schemas.warehouse import (
    BarcodeIn,
    CountBrief,
    CountIn,
    CountLineIn,
    CountLineOut,
    CountLineUpdate,
    CountOut,
    ReceiptBrief,
    ReceiptIn,
    ReceiptLineIn,
    ReceiptLineOut,
    ReceiptLineUpdate,
    ReceiptOut,
    ScanIn,
)
from app.services.barcodes import attach, find_variant, normalize
from app.services.warehouse import post_count, post_receipt

router = APIRouter()

VARIANT_LABEL = joinedload(ProductVariant.product).joinedload(Product.brand)


def _variant(db: Session, variant_id: int) -> ProductVariant:
    variant = db.scalar(
        select(ProductVariant)
        .where(ProductVariant.id == variant_id)
        .options(VARIANT_LABEL, selectinload(ProductVariant.barcodes))
    )
    if variant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Объём не найден")
    return variant


def _scanned(db: Session, code: str) -> ProductVariant:
    variant = find_variant(db, code)
    if variant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Штрихкод {normalize(code)} не найден")
    return variant


def _email(user: User | None) -> str | None:
    return user.email if user else None


# ---------- Barcodes ----------


@router.get("/barcodes/{code}", response_model=VariantSearchItem)
def lookup_barcode(code: str, db: Session = Depends(get_db)):
    """The volume a scanned barcode (or SKU) belongs to."""
    return variant_item(_scanned(db, code))


@router.post(
    "/variants/{variant_id}/barcodes",
    response_model=AdminVariantOut,
    status_code=status.HTTP_201_CREATED,
)
def add_barcode(variant_id: int, data: BarcodeIn, db: Session = Depends(get_db)):
    variant = _variant(db, variant_id)
    attach(db, variant, data.code)
    db.commit()
    return _variant(db, variant_id)


@router.delete("/variants/{variant_id}/barcodes/{code}", response_model=AdminVariantOut)
def remove_barcode(variant_id: int, code: str, db: Session = Depends(get_db)):
    variant = _variant(db, variant_id)
    barcode = next((b for b in variant.barcodes if b.code == code), None)
    if barcode is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "У этого объёма нет такого штрихкода")
    variant.barcodes.remove(barcode)
    db.commit()
    return _variant(db, variant_id)


# ---------- Receipts ----------


def _receipt(db: Session, receipt_id: int, *, lock: bool = False) -> StockReceipt:
    stmt = (
        select(StockReceipt)
        .where(StockReceipt.id == receipt_id)
        .options(
            selectinload(StockReceipt.items)
            .joinedload(StockReceiptItem.variant)
            .options(VARIANT_LABEL),
            joinedload(StockReceipt.created_by),
            joinedload(StockReceipt.posted_by),
        )
        .execution_options(populate_existing=True)
    )
    if lock:
        stmt = stmt.with_for_update(of=StockReceipt)
    receipt = db.scalar(stmt)
    if receipt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Приёмка не найдена")
    return receipt


def _draft_receipt(db: Session, receipt_id: int) -> StockReceipt:
    receipt = _receipt(db, receipt_id, lock=True)
    if receipt.status != DocumentStatus.draft:
        raise HTTPException(status.HTTP_409_CONFLICT, "Приёмка уже проведена, изменить её нельзя")
    return receipt


def _receipt_brief(r: StockReceipt) -> dict:
    return {
        "id": r.id,
        "status": r.status,
        "supplier": r.supplier,
        "number": r.number,
        "total_quantity": r.total_quantity,
        "total_cost": r.total_cost,
        "lines": len(r.items),
        "created_at": r.created_at,
        "posted_at": r.posted_at,
    }


def _receipt_out(r: StockReceipt, touched: int | None = None) -> ReceiptOut:
    draft = r.status == DocumentStatus.draft
    return ReceiptOut(
        **_receipt_brief(r),
        note=r.note,
        created_by_email=_email(r.created_by),
        posted_by_email=_email(r.posted_by),
        items=[
            ReceiptLineOut(
                id=i.id,
                variant_id=i.variant_id,
                label=i.label,
                sku=i.variant.sku if i.variant else None,
                quantity=i.quantity,
                cost_price=i.cost_price,
                stock=i.variant.stock if draft and i.variant else None,
                current_cost=i.variant.cost_price if draft and i.variant else None,
            )
            for i in r.items
        ],
        touched_line_id=touched,
    )


def _last_cost(db: Session, variant: ProductVariant) -> Decimal | None:
    """Purchase price of the volume in the latest posted receipt, else its average cost."""
    last = db.scalar(
        select(StockReceiptItem.cost_price)
        .join(StockReceipt, StockReceipt.id == StockReceiptItem.receipt_id)
        .where(
            StockReceiptItem.variant_id == variant.id,
            StockReceiptItem.cost_price.is_not(None),
            StockReceipt.status == DocumentStatus.posted,
        )
        .order_by(StockReceipt.posted_at.desc())
        .limit(1)
    )
    return last if last is not None else variant.cost_price


def _add_receipt_line(
    db: Session,
    receipt: StockReceipt,
    variant: ProductVariant,
    quantity: int,
    cost: Decimal | None = None,
) -> StockReceiptItem:
    line = next((i for i in receipt.items if i.variant_id == variant.id), None)
    if line is not None:
        line.quantity += quantity
        if cost is not None:
            line.cost_price = cost
        return line
    line = StockReceiptItem(
        variant=variant,
        label=variant.label,
        quantity=quantity,
        cost_price=cost if cost is not None else _last_cost(db, variant),
    )
    receipt.items.append(line)
    return line


def _receipt_line(receipt: StockReceipt, line_id: int) -> StockReceiptItem:
    line = next((i for i in receipt.items if i.id == line_id), None)
    if line is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Строка не найдена")
    return line


@router.get("/receipts", response_model=list[ReceiptBrief])
def list_receipts(
    status_: DocumentStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(StockReceipt).options(selectinload(StockReceipt.items))
    if status_ is not None:
        stmt = stmt.where(StockReceipt.status == status_)
    stmt = stmt.order_by(StockReceipt.id.desc()).limit(limit)
    return [ReceiptBrief(**_receipt_brief(r)) for r in db.scalars(stmt)]


@router.get("/receipts/suppliers", response_model=list[str])
def receipt_suppliers(db: Session = Depends(get_db)):
    """Suppliers of earlier receipts, most recent first (for autocomplete)."""
    return db.scalars(
        select(StockReceipt.supplier)
        .where(StockReceipt.supplier.is_not(None))
        .group_by(StockReceipt.supplier)
        .order_by(func.max(StockReceipt.id).desc())
        .limit(50)
    ).all()


@router.post("/receipts", response_model=ReceiptOut, status_code=status.HTTP_201_CREATED)
def create_receipt(
    data: ReceiptIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    receipt = StockReceipt(**data.model_dump(), created_by=admin)
    db.add(receipt)
    db.commit()
    return _receipt_out(_receipt(db, receipt.id))


@router.get("/receipts/{receipt_id}", response_model=ReceiptOut)
def get_receipt(receipt_id: int, db: Session = Depends(get_db)):
    return _receipt_out(_receipt(db, receipt_id))


@router.patch("/receipts/{receipt_id}", response_model=ReceiptOut)
def update_receipt(receipt_id: int, data: ReceiptIn, db: Session = Depends(get_db)):
    receipt = _draft_receipt(db, receipt_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(receipt, field, value)
    db.commit()
    return _receipt_out(_receipt(db, receipt_id))


@router.delete("/receipts/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_receipt(receipt_id: int, db: Session = Depends(get_db)):
    db.delete(_draft_receipt(db, receipt_id))
    db.commit()


@router.post("/receipts/{receipt_id}/scan", response_model=ReceiptOut)
def scan_into_receipt(receipt_id: int, data: ScanIn, db: Session = Depends(get_db)):
    receipt = _draft_receipt(db, receipt_id)
    line = _add_receipt_line(db, receipt, _scanned(db, data.code), data.quantity)
    db.commit()
    return _receipt_out(_receipt(db, receipt_id), touched=line.id)


@router.post("/receipts/{receipt_id}/lines", response_model=ReceiptOut)
def add_receipt_line(receipt_id: int, data: ReceiptLineIn, db: Session = Depends(get_db)):
    receipt = _draft_receipt(db, receipt_id)
    variant = _variant(db, data.variant_id)
    line = _add_receipt_line(db, receipt, variant, data.quantity, data.cost_price)
    db.commit()
    return _receipt_out(_receipt(db, receipt_id), touched=line.id)


@router.patch("/receipts/{receipt_id}/lines/{line_id}", response_model=ReceiptOut)
def update_receipt_line(
    receipt_id: int, line_id: int, data: ReceiptLineUpdate, db: Session = Depends(get_db)
):
    receipt = _draft_receipt(db, receipt_id)
    line = _receipt_line(receipt, line_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("quantity") is not None:
        line.quantity = changes["quantity"]
    if "cost_price" in changes:
        line.cost_price = changes["cost_price"]
    db.commit()
    return _receipt_out(_receipt(db, receipt_id), touched=line.id)


@router.delete("/receipts/{receipt_id}/lines/{line_id}", response_model=ReceiptOut)
def delete_receipt_line(receipt_id: int, line_id: int, db: Session = Depends(get_db)):
    receipt = _draft_receipt(db, receipt_id)
    receipt.items.remove(_receipt_line(receipt, line_id))
    db.commit()
    return _receipt_out(_receipt(db, receipt_id))


@router.post("/receipts/{receipt_id}/post", response_model=ReceiptOut)
def post_receipt_route(
    receipt_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    receipt = _draft_receipt(db, receipt_id)
    if not receipt.items:
        raise HTTPException(422, "В приёмке нет товаров")
    gone = next((i for i in receipt.items if i.variant_id is None), None)
    if gone is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Товар «{gone.label}» удалён из каталога — уберите эту строку",
        )
    post_receipt(db, receipt, admin)
    db.commit()
    return _receipt_out(_receipt(db, receipt_id))


# ---------- Stock counts ----------


def _count(db: Session, count_id: int, *, lock: bool = False) -> StockCount:
    stmt = (
        select(StockCount)
        .where(StockCount.id == count_id)
        .options(
            selectinload(StockCount.items)
            .joinedload(StockCountItem.variant)
            .options(VARIANT_LABEL),
            joinedload(StockCount.created_by),
            joinedload(StockCount.posted_by),
        )
        .execution_options(populate_existing=True)
    )
    if lock:
        stmt = stmt.with_for_update(of=StockCount)
    count = db.scalar(stmt)
    if count is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Инвентаризация не найдена")
    return count


def _draft_count(db: Session, count_id: int) -> StockCount:
    count = _count(db, count_id, lock=True)
    if count.status != DocumentStatus.draft:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Инвентаризация уже проведена, изменить её нельзя"
        )
    return count


def _expected(count: StockCount, item: StockCountItem) -> int | None:
    if count.status == DocumentStatus.posted:
        return item.expected
    return item.variant.stock if item.variant else None


def _count_brief(c: StockCount) -> dict:
    expected = [(i.counted, _expected(c, i)) for i in c.items]
    return {
        "id": c.id,
        "status": c.status,
        "note": c.note,
        "lines": len(c.items),
        "difference": sum(counted - exp for counted, exp in expected if exp is not None),
        "created_at": c.created_at,
        "posted_at": c.posted_at,
    }


def _count_out(c: StockCount, touched: int | None = None) -> CountOut:
    return CountOut(
        **_count_brief(c),
        created_by_email=_email(c.created_by),
        posted_by_email=_email(c.posted_by),
        items=[
            CountLineOut(
                id=i.id,
                variant_id=i.variant_id,
                label=i.label,
                sku=i.variant.sku if i.variant else None,
                counted=i.counted,
                expected=_expected(c, i),
            )
            for i in c.items
        ],
        touched_line_id=touched,
    )


def _add_count_line(count: StockCount, variant: ProductVariant, quantity: int) -> StockCountItem:
    line = next((i for i in count.items if i.variant_id == variant.id), None)
    if line is None:
        line = StockCountItem(variant=variant, label=variant.label, counted=0)
        count.items.append(line)
    line.counted += quantity
    return line


def _count_line(count: StockCount, line_id: int) -> StockCountItem:
    line = next((i for i in count.items if i.id == line_id), None)
    if line is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Строка не найдена")
    return line


@router.get("/counts", response_model=list[CountBrief])
def list_counts(
    status_: DocumentStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(StockCount).options(
        selectinload(StockCount.items).joinedload(StockCountItem.variant)
    )
    if status_ is not None:
        stmt = stmt.where(StockCount.status == status_)
    stmt = stmt.order_by(StockCount.id.desc()).limit(limit)
    return [CountBrief(**_count_brief(c)) for c in db.scalars(stmt)]


@router.post("/counts", response_model=CountOut, status_code=status.HTTP_201_CREATED)
def create_count(
    data: CountIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    count = StockCount(note=data.note, created_by=admin)
    db.add(count)
    db.commit()
    return _count_out(_count(db, count.id))


@router.get("/counts/{count_id}", response_model=CountOut)
def get_count(count_id: int, db: Session = Depends(get_db)):
    return _count_out(_count(db, count_id))


@router.patch("/counts/{count_id}", response_model=CountOut)
def update_count(count_id: int, data: CountIn, db: Session = Depends(get_db)):
    count = _draft_count(db, count_id)
    if "note" in data.model_fields_set:
        count.note = data.note
    db.commit()
    return _count_out(_count(db, count_id))


@router.delete("/counts/{count_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_count(count_id: int, db: Session = Depends(get_db)):
    db.delete(_draft_count(db, count_id))
    db.commit()


@router.post("/counts/{count_id}/scan", response_model=CountOut)
def scan_into_count(count_id: int, data: ScanIn, db: Session = Depends(get_db)):
    count = _draft_count(db, count_id)
    line = _add_count_line(count, _scanned(db, data.code), data.quantity)
    db.commit()
    return _count_out(_count(db, count_id), touched=line.id)


@router.post("/counts/{count_id}/lines", response_model=CountOut)
def add_count_line(count_id: int, data: CountLineIn, db: Session = Depends(get_db)):
    count = _draft_count(db, count_id)
    line = _add_count_line(count, _variant(db, data.variant_id), data.quantity)
    db.commit()
    return _count_out(_count(db, count_id), touched=line.id)


@router.patch("/counts/{count_id}/lines/{line_id}", response_model=CountOut)
def update_count_line(
    count_id: int, line_id: int, data: CountLineUpdate, db: Session = Depends(get_db)
):
    count = _draft_count(db, count_id)
    line = _count_line(count, line_id)
    line.counted = data.counted
    db.commit()
    return _count_out(_count(db, count_id), touched=line.id)


@router.delete("/counts/{count_id}/lines/{line_id}", response_model=CountOut)
def delete_count_line(count_id: int, line_id: int, db: Session = Depends(get_db)):
    count = _draft_count(db, count_id)
    count.items.remove(_count_line(count, line_id))
    db.commit()
    return _count_out(_count(db, count_id))


@router.post("/counts/{count_id}/post", response_model=CountOut)
def post_count_route(
    count_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    count = _draft_count(db, count_id)
    if not count.items:
        raise HTTPException(422, "В инвентаризации нет товаров")
    gone = next((i for i in count.items if i.variant_id is None), None)
    if gone is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Товар «{gone.label}» удалён из каталога — уберите эту строку",
        )
    post_count(db, count, admin)
    db.commit()
    return _count_out(_count(db, count_id))
