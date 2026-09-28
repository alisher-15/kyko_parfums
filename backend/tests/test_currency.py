"""The dollar rate: read from mig.kz, remembered, corrected by the admin."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.models import ExchangeRate, UserRole
from app.services import rates

TABLE = """
<html><head><style>.x{color:red}</style><script>var usd = 12345;</script></head><body>
<table><tr><th>Валюта</th><th>Покупка</th><th>Продажа</th></tr>
<tr><td>USD</td><td>497,50</td><td>500.30</td></tr>
<tr><td>EUR</td><td>560</td><td>575</td></tr></table></body></html>
"""
DIVS = '<div class="rate"><span>$</span> <b>498</b> / <b>501</b></div>'
ONLY_ONE = "<p>USD 502</p>"
NO_RATE = "<html><body><p>Курсы временно недоступны</p><p>USD ——</p></body></html>"


@pytest.mark.parametrize(
    ("page", "expected"),
    [(TABLE, "500.30"), (DIVS, "501"), (ONLY_ONE, "502")],
)
def test_parse_reads_the_selling_rate(page, expected):
    assert rates.parse_usd_rate(page) == Decimal(expected)


def test_parse_ignores_scripts_and_refuses_a_page_without_a_rate():
    with pytest.raises(rates.RateError, match="не найден курс"):
        rates.parse_usd_rate(NO_RATE)
    # 12345 sits in a script and is not a rate; 30 is too small to be one.
    with pytest.raises(rates.RateError):
        rates.parse_usd_rate("<script>USD 1234</script><p>USD 30</p>")


@pytest.fixture
def source(monkeypatch):
    """The page mig.kz returns: source.page = "..." or source.error = OSError(...)."""

    class Source:
        page: str = TABLE
        error: Exception | None = None
        calls = 0

    src = Source()

    def fetch():
        src.calls += 1
        if src.error:
            raise src.error
        return src.page

    monkeypatch.setattr(rates, "fetch_html", fetch)
    return src


def test_public_rate_is_read_once_and_remembered(client, source):
    r = client.get("/api/currency").json()
    assert r["usd_rate"] == 500.30
    assert r["updated_at"] is not None
    # The second call in the same hours doesn't go to the source again.
    client.get("/api/currency")
    assert source.calls == 1
    # The public answer has no parts of the rate.
    assert set(r) == {"usd_rate", "updated_at"}


def test_a_dead_source_keeps_the_last_rate_and_says_why(client, auth, db, source):
    admin = auth(UserRole.admin)
    assert client.get("/api/currency").json()["usd_rate"] == 500.30

    row = db.get(ExchangeRate, 1)
    row.checked_at = datetime.now(UTC) - timedelta(hours=4)
    db.commit()
    source.error = OSError("timed out")

    assert client.get("/api/currency").json()["usd_rate"] == 500.30
    state = client.get("/api/admin/currency", headers=admin).json()
    assert state["source_error"] == "mig.kz не отвечает"
    assert state["source_rate"] == 500.30

    # After a failure it tries again in 15 minutes, not hours.
    row = db.get(ExchangeRate, 1)
    db.refresh(row)
    row.checked_at = datetime.now(UTC) - timedelta(minutes=16)
    db.commit()
    source.error = None
    source.page = "<p>USD 505</p>"
    assert client.get("/api/currency").json()["usd_rate"] == 505
    assert client.get("/api/admin/currency", headers=admin).json()["source_error"] is None


def test_a_wild_jump_is_a_misread_not_a_rate(client, auth, source):
    admin = auth(UserRole.admin)
    client.get("/api/currency")
    source.page = "<p>USD 900</p>"
    r = client.post("/api/admin/currency/refresh", headers=admin)
    assert r.status_code == 502
    assert "похоже на сбой" in r.json()["detail"]
    state = client.get("/api/admin/currency", headers=admin).json()
    assert state["source_rate"] == 500.30
    assert "900" in state["source_error"]


def test_no_rate_at_all_until_the_source_answers(client, source):
    source.error = OSError("down")
    assert client.get("/api/currency").json() == {"usd_rate": None, "updated_at": None}


def test_admin_shifts_the_rate_or_types_one(client, auth, source):
    admin = auth(UserRole.admin)
    client.get("/api/currency")

    r = client.put("/api/admin/currency", json={"adjustment": 7.5}, headers=admin).json()
    assert (r["source_rate"], r["adjustment"], r["effective_rate"]) == (500.30, 7.5, 507.80)
    assert client.get("/api/currency").json()["usd_rate"] == 507.80

    r = client.put("/api/admin/currency", json={"adjustment": -10}, headers=admin).json()
    assert r["effective_rate"] == 490.30

    # A rate typed by hand replaces both; the source is not asked while it is set.
    calls = source.calls
    r = client.put(
        "/api/admin/currency", json={"adjustment": 5, "manual_rate": 512}, headers=admin
    ).json()
    assert (r["manual_rate"], r["effective_rate"]) == (512, 512)
    assert client.get("/api/currency").json()["usd_rate"] == 512
    assert source.calls == calls

    # Clearing it goes back to mig.kz plus the shift.
    r = client.put("/api/admin/currency", json={"adjustment": 5}, headers=admin).json()
    assert (r["manual_rate"], r["effective_rate"]) == (None, 505.30)


def test_a_manual_rate_works_when_the_source_never_did(client, auth, source):
    admin = auth(UserRole.admin)
    source.error = OSError("down")
    r = client.put("/api/admin/currency", json={"manual_rate": 495}, headers=admin).json()
    assert r["effective_rate"] == 495
    assert client.get("/api/currency").json()["usd_rate"] == 495


def test_admin_limits_and_access(client, auth, source):
    admin = auth(UserRole.admin)
    for body in ({"adjustment": 51}, {"adjustment": -51}, {"manual_rate": 0}, {"manual_rate": -5}):
        assert client.put("/api/admin/currency", json=body, headers=admin).status_code == 422
    for headers in ({}, auth(UserRole.retail), auth(UserRole.wholesale)):
        assert client.get("/api/admin/currency", headers=headers).status_code in (401, 403)
        assert client.put("/api/admin/currency", json={}, headers=headers).status_code in (401, 403)
        assert client.post("/api/admin/currency/refresh", headers=headers).status_code in (
            401,
            403,
        )


def test_the_source_can_be_switched_off(client, auth, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "rate_source_url", "")
    admin = auth(UserRole.admin)
    assert client.get("/api/currency").json()["usd_rate"] is None
    r = client.post("/api/admin/currency/refresh", headers=admin)
    assert r.status_code == 502
    assert "источник курса отключён" in r.json()["detail"]
