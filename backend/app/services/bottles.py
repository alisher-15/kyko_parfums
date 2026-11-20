"""The bottle photos that came with the code (frontend/public/bottles), moved to the bucket.

With R2 set, `python -m app.cli photos-to-r2` uploads them under bottles/ with the same names and
points the catalog at them, so every photo of the shop is in one place. An Excel file that still
says /bottles/<name> is read as the bucket's copy (``bucket_url``): old exports keep their photos.
"""

from pathlib import Path

from sqlalchemy import func, literal, update
from sqlalchemy.orm import Session

from app.config import BASE_DIR, get_settings
from app.models import Product, ProductVariant
from app.services import storage

LOCAL_PREFIX = "/bottles/"
KEY_PREFIX = "bottles/"
CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def default_dir() -> Path:
    """frontend/public/bottles: next to backend/ in the repository and in the all-in-one image."""
    return BASE_DIR.parent / "frontend" / "public" / "bottles"


def _bucket_base() -> str:
    return f"{get_settings().r2_public_url.rstrip('/')}/{KEY_PREFIX}"


def bucket_url(url: str | None) -> str | None:
    """A /bottles/<name> link as the bucket's copy when the bucket is set; anything else as is."""
    if url and url.startswith(LOCAL_PREFIX) and storage.use_bucket():
        return _bucket_base() + url[len(LOCAL_PREFIX) :]
    return url


def upload(directory: Path) -> int:
    """Put every photo of the folder into the bucket under bottles/; returns how many."""
    count = 0
    for path in sorted(directory.iterdir()):
        content_type = CONTENT_TYPES.get(path.suffix.lower())
        if not path.is_file() or content_type is None:
            continue
        storage.save(KEY_PREFIX + path.name, path.read_bytes(), content_type)
        count += 1
        if count % 100 == 0:
            print(f"… {count}", flush=True)
    return count


def relink(db: Session) -> int:
    """Point products and volumes at the bucket's copies; returns how many links changed.
    The caller commits. Links already in the bucket are left alone, so it can run again."""
    base = _bucket_base()
    changed = 0
    for model, column in ((Product, Product.image_url), (ProductVariant, ProductVariant.photo_url)):
        rest = func.substr(column, len(LOCAL_PREFIX) + 1)
        result = db.execute(
            update(model)
            .where(column.startswith(LOCAL_PREFIX))
            .values({column.key: literal(base) + rest})
        )
        changed += result.rowcount
    return changed
