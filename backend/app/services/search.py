from sqlalchemy import and_, or_, true

from app.models import Brand, Product


def contains(term: str) -> str:
    """ILIKE pattern matching ``term`` anywhere; ``%`` and ``_`` in it are literal characters.

    PostgreSQL's default LIKE escape character is the backslash.
    """
    escaped = term.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def product_name_match(q: str):
    """Every word must match the brand or the product name: "chanel chance" finds Chance."""
    return and_(
        true(),
        *(or_(Product.name.ilike(contains(w)), Brand.name.ilike(contains(w))) for w in q.split()),
    )
