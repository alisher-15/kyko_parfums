"""Price history: every change of a volume's cost or prices is written to price_changes.

A hook before each flush compares the old and new values (the columns keep their old value,
``active_history``), so nothing that changes a price can forget it: the admin panel, an Excel
import, a supplier's price list, a receipt's average cost. The code that changes prices names
itself with ``label`` first; the history shows that name and who it was.
"""

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.models import PriceChange, PriceField, ProductVariant, User

FIELDS = {
    PriceField.cost: "cost_price",
    PriceField.retail: "retail_price",
    PriceField.wholesale: "wholesale_price",
    PriceField.bulk: "bulk_price",
}
UNNAMED = "Изменение"


def label(db: Session, source: str, user: User | None = None) -> None:
    """What the next price changes of this session come from: «Админка», «Прайс Канат», …"""
    db.info["price_source"] = (source[:255], user.id if user else None)


@event.listens_for(Session, "before_flush")
def _write_down(session: Session, _context, _instances) -> None:
    source, user_id = session.info.get("price_source", (UNNAMED, None))
    for obj in list(session.dirty):
        # A new volume's first prices are not a change.
        if not isinstance(obj, ProductVariant) or obj.id is None:
            continue
        state = inspect(obj)
        for field, attr in FIELDS.items():
            history = state.attrs[attr].history
            if not history.has_changes():
                continue
            old = history.deleted[0] if history.deleted else None
            new = history.added[0] if history.added else None
            if old == new:
                continue
            session.add(
                PriceChange(
                    variant_id=obj.id,
                    field=field,
                    old_value=old,
                    new_value=new,
                    source=source,
                    user_id=user_id,
                )
            )
