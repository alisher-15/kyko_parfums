import uuid
from zipfile import BadZipFile

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.db import get_db
from app.models import Brand, Order, OrderStatus, Product, ProductVariant, User, UserRole
from app.schemas.admin import (
    ImportReport,
    PricingSettingsIO,
    PricingSettingsOut,
    StatsOut,
    UploadOut,
)
from app.services.importer import build_template, import_catalog
from app.services.settings import get_pricing_settings

router = APIRouter()

IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
# Magic bytes, so a renamed non-image file is rejected.
IMAGE_SIGNATURES = {
    ".jpg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".gif": (b"GIF87a", b"GIF89a"),
    ".webp": (b"RIFF",),
}
LOW_STOCK = 3


# ---------- Pricing settings ----------


@router.get("/settings/pricing", response_model=PricingSettingsOut)
def get_pricing(db: Session = Depends(get_db)):
    return get_pricing_settings(db)


@router.put("/settings/pricing", response_model=PricingSettingsOut)
def update_pricing(data: PricingSettingsIO, db: Session = Depends(get_db)):
    s = get_pricing_settings(db)
    for k, v in data.model_dump().items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


# ---------- Uploads ----------


@router.post("/uploads", response_model=UploadOut, status_code=status.HTTP_201_CREATED)
async def upload_image(file: UploadFile = File(...)):
    settings = get_settings()
    ext = IMAGE_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(415, "Допустимы только изображения JPEG, PNG, WEBP или GIF")
    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(413, f"Файл больше {settings.max_upload_mb} МБ")
    if not data.startswith(IMAGE_SIGNATURES[ext]) or (ext == ".webp" and data[8:12] != b"WEBP"):
        raise HTTPException(415, "Файл не похож на изображение указанного формата")

    name = f"{uuid.uuid4().hex}{ext}"
    target_dir = settings.media_dir / "products"
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / name).write_bytes(data)
    return UploadOut(url=f"{settings.media_url_prefix}/products/{name}")


# ---------- Import ----------


@router.post("/import/catalog", response_model=ImportReport)
async def import_catalog_file(
    file: UploadFile = File(...),
    dry_run: bool = Query(default=False),
    sheet: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    filename = file.filename or ""
    if not filename.lower().endswith((".xlsx", ".xlsm", ".csv")):
        raise HTTPException(415, "Поддерживаются файлы .xlsx и .csv")
    content = await file.read(50 * 1024 * 1024)
    try:
        # Parsing + DB work is blocking: keep it off the event loop.
        return await run_in_threadpool(
            import_catalog, db, content, filename, sheet=sheet, dry_run=dry_run
        )
    except (ValueError, KeyError, BadZipFile, InvalidFileException) as e:
        db.rollback()
        raise HTTPException(422, str(e).strip("'\"")) from e


@router.get("/import/template")
def import_template():
    return Response(
        content=build_template(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="catalog_template.xlsx"'},
    )


# ---------- Dashboard ----------


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)):
    users_by_role = {r.value: 0 for r in UserRole}
    for role, cnt in db.execute(select(User.role, func.count()).group_by(User.role)):
        users_by_role[role.value] = cnt
    orders_by_status = {s.value: 0 for s in OrderStatus}
    for st, cnt in db.execute(select(Order.status, func.count()).group_by(Order.status)):
        orders_by_status[st.value] = cnt

    return StatsOut(
        users_by_role=users_by_role,
        wholesale_requests=db.scalar(
            select(func.count()).select_from(User).where(User.wholesale_requested)
        )
        or 0,
        orders_by_status=orders_by_status,
        revenue_total=db.scalar(
            select(func.coalesce(func.sum(Order.total_amount), 0)).where(
                Order.status != OrderStatus.cancelled
            )
        ),
        products_total=db.scalar(select(func.count(Product.id))) or 0,
        products_without_variants=db.scalar(
            select(func.count(Product.id)).where(~Product.variants.any())
        )
        or 0,
        variants_low_stock=db.scalar(
            select(func.count(ProductVariant.id)).where(
                ProductVariant.is_active, ProductVariant.stock <= LOW_STOCK
            )
        )
        or 0,
        brands_total=db.scalar(select(func.count(Brand.id))) or 0,
    )
