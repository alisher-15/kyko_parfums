"""The dollar rate: what the storefront shows, how the admin corrects it."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ExchangeRate
from app.schemas.currency import RateAdminOut, RateIn
from app.services import rates

router = APIRouter(prefix="/currency")


def _out(row: ExchangeRate) -> RateAdminOut:
    return RateAdminOut(
        effective_rate=row.effective_rate,
        source_rate=row.source_rate,
        source_updated_at=row.source_updated_at,
        checked_at=row.checked_at,
        source_error=row.source_error,
        adjustment=row.adjustment,
        manual_rate=row.manual_rate,
    )


@router.get("", response_model=RateAdminOut)
def get_rate(db: Session = Depends(get_db)):
    return _out(rates.refresh_if_stale(db))


@router.put("", response_model=RateAdminOut)
def set_rate(data: RateIn, db: Session = Depends(get_db)):
    row = rates.get_rate_row(db)
    row.adjustment = data.adjustment
    row.manual_rate = data.manual_rate
    db.commit()
    return _out(rates.get_rate_row(db))


@router.post("/refresh", response_model=RateAdminOut)
def refresh_now(db: Session = Depends(get_db)):
    """Read mig.kz now. On failure the last rate stays and the reason is returned."""
    row = rates.get_rate_row(db)
    try:
        rates.refresh(db, row)
    except rates.RateError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Не удалось получить курс: {e}") from e
    return _out(rates.get_rate_row(db))
