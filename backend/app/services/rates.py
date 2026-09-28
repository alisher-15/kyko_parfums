"""The dollar rate for prices in USD.

The rate comes from mig.kz and is remembered: when the site is down or its page changes, the
last good rate stays and the admin can type one by hand (ExchangeRate.manual_rate). Nothing
here runs on a timer: the public endpoint refreshes a stale rate when someone asks for it.
"""

import html
import logging
import re
import urllib.request
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import ExchangeRate

log = logging.getLogger(__name__)

FETCH_TIMEOUT = 5  # seconds: a slow source must not hold a page load for long
REFRESH_AFTER = timedelta(hours=3)
RETRY_AFTER_FAILURE = timedelta(minutes=15)
# A rate outside this range is a misread number, not a rate.
MIN_RATE, MAX_RATE = Decimal(100), Decimal(2000)
# A new rate this far from the last good one is more likely a misread than a real jump.
MAX_JUMP = Decimal("0.15")


class RateError(Exception):
    """The rate could not be read; the message is shown to the admin."""


def fetch_html() -> str:
    url = get_settings().rate_source_url
    if not url:
        raise RateError("источник курса отключён, укажите курс вручную")
    request = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; KykoParfum/1.0)"}
    )
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT) as response:  # noqa: S310
        raw = response.read(2_000_000)
        charset = response.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def parse_usd_rate(page: str) -> Decimal:
    """The dollar's selling rate from the text of the page.

    Reads the numbers that follow the first "USD" (or "$") that has plausible rates after it:
    buy and sell, in this order. The sell rate is used (the second number, else the only one).
    """
    text = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", page)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", html.unescape(text))
    for label in re.finditer(r"USD|\$|доллар", text, flags=re.IGNORECASE):
        window = text[label.end() : label.end() + 60]
        rates = []
        for number in re.findall(r"\d{3,4}(?:[.,]\d{1,2})?", window):
            try:
                value = Decimal(number.replace(",", "."))
            except InvalidOperation:
                continue
            if MIN_RATE <= value <= MAX_RATE:
                rates.append(value)
        if rates:
            return rates[1] if len(rates) > 1 else rates[0]
    raise RateError("на странице mig.kz не найден курс доллара")


def get_rate_row(db: Session) -> ExchangeRate:
    row = db.get(ExchangeRate, 1)
    if row is None:
        row = ExchangeRate(id=1, adjustment=Decimal(0))
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def is_stale(row: ExchangeRate, now: datetime) -> bool:
    if row.checked_at is None:
        return True
    wait = RETRY_AFTER_FAILURE if row.source_error else REFRESH_AFTER
    return now - row.checked_at >= wait


def read_rate(last: Decimal | None) -> Decimal:
    """The current rate from the source, checked against the last good one."""
    try:
        rate = parse_usd_rate(fetch_html())
    except RateError:
        raise
    except Exception as e:  # network, TLS, timeout, decoding
        log.warning("Could not read the rate source: %s", e)
        raise RateError("mig.kz не отвечает") from e
    if last is not None and abs(rate - last) / last > MAX_JUMP:
        raise RateError(f"mig.kz показывает {rate} ₸ при прошлом курсе {last} ₸: похоже на сбой")
    return rate


def refresh(db: Session, row: ExchangeRate) -> None:
    """Read the source and remember the result; on failure keep the last good rate.

    Raises RateError (after saving why) so that "refresh now" can tell the admin.
    """
    now = datetime.now(UTC)
    row.checked_at = now
    try:
        rate = read_rate(row.source_rate)
    except RateError as e:
        row.source_error = str(e)[:255]
        db.commit()
        raise
    row.source_rate = rate
    row.source_updated_at = now
    row.source_error = None
    db.commit()


def refresh_if_stale(db: Session) -> ExchangeRate:
    """The rate row, read from the source first when it is out of date.

    Only one request refreshes at a time: the row is locked while the source is read, and
    the others go on with the rate they have.
    """
    row = get_rate_row(db)
    if row.manual_rate is not None or not is_stale(row, datetime.now(UTC)):
        return row
    locked = db.scalar(
        select(ExchangeRate)
        .where(ExchangeRate.id == 1)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    )
    if locked is None:
        return row
    if is_stale(locked, datetime.now(UTC)):
        try:
            refresh(db, locked)
        except RateError:
            pass  # the reason is saved in source_error; the last good rate stays
    else:
        db.rollback()
    return get_rate_row(db)
