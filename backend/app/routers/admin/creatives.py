"""Banners and stories from templates (services/creatives.py): a preview, or a saved picture."""

import base64
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Product
from app.schemas.creatives import CreativeIn, CreativeOut
from app.services import creatives

log = logging.getLogger(__name__)

router = APIRouter(prefix="/creatives")


def _photo_url(product: Product) -> str | None:
    """The product's photo, else the first volume's own."""
    if product.image_url:
        return product.image_url
    for v in sorted(product.variants, key=lambda v: (v.volume_ml, v.is_tester)):
        if v.photo_url:
            return v.photo_url
    return None


@router.post("/render", response_model=CreativeOut)
async def render_creative(
    data: CreativeIn,
    save: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    """Draws the picture. save=false returns it as a data URL to look at or download; save=true
    stores it (like an upload) and returns its link."""
    ids = list(dict.fromkeys(data.product_ids))
    products = {
        p.id: p
        for p in db.scalars(
            select(Product).where(Product.id.in_(ids)).options(selectinload(Product.variants))
        )
    }
    unknown = [i for i in ids if i not in products]
    if unknown:
        raise HTTPException(404, f"Товар не найден: {', '.join(map(str, unknown))}")
    urls = [(pid, _photo_url(products[pid])) for pid in ids]
    spec = creatives.Spec(
        format=data.format,
        theme=data.theme,
        title=data.title,
        subtitle=data.subtitle,
        badge=data.badge,
        note=data.note,
    )

    def draw() -> tuple[bytes, list[int], tuple[int, int]]:
        photos, missing = [], []
        for pid, url in urls:
            photo = creatives.load_photo(url)
            if photo is None:
                missing.append(pid)
            else:
                photos.append(photo)
        im = creatives.render(spec, photos)
        return creatives.jpeg(im), missing, im.size

    # Pillow and photo downloads are blocking: keep them off the event loop.
    jpeg, missing, (width, height) = await run_in_threadpool(draw)
    out = CreativeOut(width=width, height=height, missing_photos=missing)
    if not save:
        out.preview = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
        return out
    key = f"creatives/{uuid.uuid4().hex}.jpg"
    try:
        out.url = await run_in_threadpool(creatives.save, jpeg, key)
    except Exception as e:  # network / credentials of the bucket
        log.exception("Saving a creative to storage failed")
        raise HTTPException(
            502, "Не удалось сохранить картинку в хранилище, попробуйте ещё раз"
        ) from e
    return out
