import re

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Product, ProductVariant, VariantBarcode


def normalize(code: str) -> str:
    return re.sub(r"\s+", "", code or "")


def _candidates(code: str) -> list[str]:
    """The same product can be read as UPC-A (12 digits) or EAN-13 with a leading zero,
    depending on the scanner; try both."""
    out = [code]
    if code.isdigit() and len(code) == 12:
        out.append("0" + code)
    elif code.isdigit() and len(code) == 13 and code.startswith("0"):
        out.append(code[1:])
    return out


def find_variant(db: Session, code: str) -> ProductVariant | None:
    """A variant by one of its barcodes, or by its SKU (older imports kept barcodes there)."""
    code = normalize(code)
    if not code:
        return None
    options = joinedload(ProductVariant.product).joinedload(Product.brand)
    candidates = _candidates(code)
    variant = db.scalar(
        select(ProductVariant)
        .join(VariantBarcode, VariantBarcode.variant_id == ProductVariant.id)
        .where(VariantBarcode.code.in_(candidates))
        .options(options)
        .limit(1)
    )
    if variant is None:
        variant = db.scalar(
            select(ProductVariant)
            .where(func.lower(ProductVariant.sku).in_([c.lower() for c in candidates]))
            .options(options)
            .limit(1)
        )
    return variant


def attach(db: Session, variant: ProductVariant, code: str) -> None:
    """Add a barcode to a volume. Idempotent; 409 if another volume already has it."""
    code = normalize(code)
    if not code:
        raise HTTPException(422, "Пустой штрихкод")
    owner = find_variant(db, code)
    if owner is not None and owner.id != variant.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Штрихкод {code} уже привязан к товару «{owner.label}»",
        )
    if code not in {b.code for b in variant.barcodes} and code != variant.sku:
        variant.barcodes.append(VariantBarcode(code=code))
