from zipfile import BadZipFile

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db import get_db
from app.deps import require_admin
from app.models import (
    ProductVariant,
    Supplier,
    SupplierLink,
    SupplierPrice,
    SupplierPriceList,
    User,
)
from app.schemas.suppliers import (
    LinkIn,
    LinkOut,
    LinkProblem,
    LinksReport,
    PriceChangeLine,
    PriceListOut,
    PriceListReport,
    SupplierOut,
    UnmatchedLine,
    VariantSupplierPrice,
)
from app.services import suppliers as svc
from app.services.price_lists import PriceListError, line_key, read_price_list

router = APIRouter()

CHANGES_LIMIT = 300
MAX_FILE = 50 * 1024 * 1024
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _supplier(db: Session, supplier_id: int) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise HTTPException(404, "Поставщик не найден")
    return supplier


async def _read(file: UploadFile) -> tuple[bytes, str]:
    name = file.filename or ""
    if not name.lower().endswith((".xlsx", ".xlsm", ".csv")):
        raise HTTPException(415, "Поддерживаются файлы .xlsx и .csv")
    return await file.read(MAX_FILE), name


@router.get("/suppliers", response_model=list[SupplierOut])
def list_suppliers(db: Session = Depends(get_db)):
    prices = dict(
        db.execute(
            select(SupplierPrice.supplier_id, func.count()).group_by(SupplierPrice.supplier_id)
        ).all()
    )
    links = {
        supplier_id: (total, ignored)
        for supplier_id, total, ignored in db.execute(
            select(
                SupplierLink.supplier_id,
                func.count(),
                func.count().filter(SupplierLink.variant_id.is_(None)),
            ).group_by(SupplierLink.supplier_id)
        ).all()
    }
    last_ids = (
        select(func.max(SupplierPriceList.id)).group_by(SupplierPriceList.supplier_id)
    ).scalar_subquery()
    last = {
        pl.supplier_id: PriceListOut(
            id=pl.id,
            file_name=pl.file_name,
            uploaded_at=pl.uploaded_at,
            user_email=email,
            lines=pl.lines,
            matched=pl.matched,
            unmatched=pl.unmatched,
        )
        for pl, email in db.execute(
            select(SupplierPriceList, User.email)
            .outerjoin(User, User.id == SupplierPriceList.user_id)
            .where(SupplierPriceList.id.in_(last_ids))
        ).all()
    }
    return [
        SupplierOut(
            id=s.id,
            name=s.name,
            is_main=s.is_main,
            price_format=s.price_format,
            prices=prices.get(s.id, 0),
            links=links.get(s.id, (0, 0))[0] - links.get(s.id, (0, 0))[1],
            ignored=links.get(s.id, (0, 0))[1],
            last_list=last.get(s.id),
        )
        for s in db.scalars(select(Supplier).order_by(Supplier.is_main.desc(), Supplier.name))
    ]


def _report(plan: svc.Plan, dry_run: bool) -> PriceListReport:
    changes = plan.changes

    def rose(old, new) -> bool:
        return old is not None and new is not None and new > old

    def fell(old, new) -> bool:
        return old is not None and new is not None and new < old

    def weight(c: svc.Change) -> tuple:
        cost = abs(c.cost_new - c.cost_old) / c.cost_old if c.cost_old and c.cost_new else 0
        supplier = abs(c.supplier_new - c.supplier_old) / c.supplier_old if c.supplier_old else 0
        return (c.prices_new != c.prices_old, cost, supplier)

    return PriceListReport(
        dry_run=dry_run,
        lines=len(plan.matches),
        matched=sum(1 for m in plan.matches if m.variant is not None),
        by_barcode=sum(1 for m in plan.matches if m.by == "barcode"),
        ignored=sum(1 for m in plan.matches if m.ignored),
        duplicates=plan.duplicates,
        unmatched=[
            UnmatchedLine(
                row=m.line.row, line=m.line.text, price=m.line.price, barcode=m.line.barcode
            )
            for m in plan.matches
            if m.variant is None and not m.ignored
        ],
        supplier_new=sum(1 for c in changes if c.supplier_old is None),
        supplier_up=sum(1 for c in changes if rose(c.supplier_old, c.supplier_new)),
        supplier_down=sum(1 for c in changes if fell(c.supplier_old, c.supplier_new)),
        cost_up=sum(1 for c in changes if rose(c.cost_old, c.cost_new)),
        cost_down=sum(1 for c in changes if fell(c.cost_old, c.cost_new)),
        prices_raised=sum(1 for c in changes if c.prices_new != c.prices_old),
        prices_kept=sum(
            1 for c in changes if fell(c.cost_old, c.cost_new) and c.prices_new == c.prices_old
        ),
        remembered=sum(1 for c in changes if c.remember),
        waiting_for_main=plan.waiting_for_main,
        changes=[
            PriceChangeLine(
                variant_id=c.variant.id,
                product_id=c.variant.product_id,
                label=c.variant.label,
                line=c.line,
                supplier_old=c.supplier_old,
                supplier_new=c.supplier_new,
                cost_old=c.cost_old,
                cost_new=c.cost_new,
                retail_old=c.prices_old[0],
                retail_new=c.prices_new[0],
                wholesale_old=c.prices_old[1],
                wholesale_new=c.prices_new[1],
                bulk_old=c.prices_old[2],
                bulk_new=c.prices_new[2],
            )
            for c in sorted(changes, key=weight, reverse=True)[:CHANGES_LIMIT]
        ],
    )


@router.post("/suppliers/{supplier_id}/price-list", response_model=PriceListReport)
async def upload_price_list(
    supplier_id: int,
    file: UploadFile = File(...),
    dry_run: bool = Query(default=True),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """A price list: what it changes (the default), or applied with ``dry_run=false``."""
    content, name = await _read(file)
    supplier = _supplier(db, supplier_id)

    def run() -> PriceListReport:
        lines = read_price_list(supplier.price_format, content, name)
        plan = svc.plan_price_list(db, supplier, lines, lock=not dry_run)
        report = _report(plan, dry_run)
        if dry_run:
            db.rollback()
        else:
            svc.apply_price_list(db, supplier, plan, name, admin)
            db.commit()
        return report

    try:
        # Parsing + DB work is blocking: keep it off the event loop.
        return await run_in_threadpool(run)
    except PriceListError as e:
        db.rollback()
        raise HTTPException(422, str(e)) from e


@router.post("/suppliers/{supplier_id}/links", response_model=LinkOut)
def link_line(supplier_id: int, data: LinkIn, db: Session = Depends(get_db)):
    """Which volume a price list line is; ``variant_id`` null: «не наш товар»."""
    supplier = _supplier(db, supplier_id)
    if data.variant_id is not None and db.get(ProductVariant, data.variant_id) is None:
        raise HTTPException(404, "Объём не найден")
    link = svc.link_line(db, supplier, data.line, data.variant_id)
    db.commit()
    return LinkOut(line=link.line, variant_id=link.variant_id)


@router.delete("/suppliers/{supplier_id}/links", status_code=status.HTTP_204_NO_CONTENT)
def unlink_line(
    supplier_id: int, line: str = Query(min_length=1, max_length=512), db: Session = Depends(get_db)
):
    supplier = _supplier(db, supplier_id)
    link = db.scalar(
        select(SupplierLink).where(
            SupplierLink.supplier_id == supplier.id, SupplierLink.key == line_key(line)
        )
    )
    if link is not None:
        db.delete(link)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/suppliers/{supplier_id}/links/import", response_model=LinksReport)
async def import_links(
    supplier_id: int,
    file: UploadFile = File(...),
    dry_run: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    """Links from a file (as «Скачать сопоставление» writes it)."""
    content, name = await _read(file)
    supplier = _supplier(db, supplier_id)

    def run() -> LinksReport:
        result = svc.import_links(db, supplier, content, name)
        if dry_run:
            db.rollback()
        else:
            db.commit()
        return LinksReport(
            dry_run=dry_run,
            rows=result.rows,
            linked=result.linked,
            ignored=result.ignored,
            problems=[LinkProblem(row=r, line=line, error=e) for r, line, e in result.problems],
        )

    try:
        return await run_in_threadpool(run)
    except (ValueError, KeyError, BadZipFile, InvalidFileException) as e:
        db.rollback()
        raise HTTPException(422, str(e).strip("'\"")) from e


@router.get("/suppliers/{supplier_id}/links/export")
def export_links(supplier_id: int, db: Session = Depends(get_db)):
    supplier = _supplier(db, supplier_id)
    return Response(
        content=svc.export_links(db, supplier),
        media_type=XLSX,
        headers={"Content-Disposition": 'attachment; filename="links.xlsx"'},
    )


@router.get("/products/{product_id}/supplier-prices", response_model=list[VariantSupplierPrice])
def product_supplier_prices(product_id: int, db: Session = Depends(get_db)):
    """The suppliers' prices of each volume of a product, for its card."""
    latest = dict(
        db.execute(
            select(SupplierPriceList.supplier_id, func.max(SupplierPriceList.id)).group_by(
                SupplierPriceList.supplier_id
            )
        ).all()
    )
    rows = db.execute(
        select(SupplierPrice, Supplier)
        .join(Supplier, Supplier.id == SupplierPrice.supplier_id)
        .join(ProductVariant, ProductVariant.id == SupplierPrice.variant_id)
        .where(ProductVariant.product_id == product_id)
        .order_by(SupplierPrice.variant_id, Supplier.is_main.desc(), Supplier.name)
    ).all()
    return [
        VariantSupplierPrice(
            variant_id=sp.variant_id,
            supplier_id=s.id,
            supplier=s.name,
            is_main=s.is_main,
            price=sp.price,
            price_usd=sp.price_usd,
            line=sp.line,
            updated_at=sp.updated_at,
            latest=sp.price_list_id is not None and sp.price_list_id == latest.get(s.id),
        )
        for sp, s in rows
    ]
