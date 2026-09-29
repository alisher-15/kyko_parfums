"""The dollar rate: read from mig.kz, remembered, corrected by the admin."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.models import ExchangeRate, UserRole
from app.services import rates


def mig_page(buy: str = "439.3", sell: str = "441.9") -> str:
    """mig.kz as it looks: a row "buy CODE sell" per currency, the National Bank below."""
    return f"""
<html><head><style>.x{{color:red}}</style><script>var usd = 1234;</script></head><body>
<div class="head">КУРСЫ ВАЛЮТ на 28 сентября 2026 17:22</div>
<table>
<tr><td>{buy}</td><td>USD</td><td>{sell}</td></tr>
<tr><td>500.5</td><td>EUR</td><td>504.5</td></tr>
<tr><td>4.95</td><td>RUB</td><td>5.07</td></tr>
<tr><td>4.83</td><td>KGS</td><td>5.23</td></tr>
<tr><td>581</td><td>GBP</td><td>601</td></tr>
<tr><td>65.9</td><td>CNY</td><td>68.3</td></tr>
<tr><td>57150</td><td>GOLD</td><td>60150</td></tr>
</table>
<p>Лицензия АГФ НБ РК №7520029 от 23.09.2020. РЕЖИМ РАБОТЫ: 09.00-20.00</p>
<h3>КУРСЫ НАЦИОНАЛЬНОГО БАНКА</h3><p>на 29 сентября 2026</p>
<div><b>USD</b> 441.77 тенге</div><div><b>EUR</b> 502.38 тенге</div>
</body></html>
"""


@pytest.mark.parametrize(
    ("page", "expected"),
    [
        # The mistake that went live: the numbers after "USD" are the sell rate and the EUR buy
        # rate, so the "second number" was 500.5.
        (mig_page(), "441.9"),
        (mig_page("439,30", "441,90"), "441.9"),
        ("<td>439.3</td>\n<td>&nbsp;USD&nbsp;</td>\n<td>441.9</td>", "441.9"),
    ],
)
def test_parse_reads_the_selling_rate_of_the_usd_row(page, expected):
    assert rates.parse_usd_rate(page) == Decimal(expected)


@pytest.mark.parametrize(
    "page",
    [
        "<html><body><p>Курсы временно недоступны</p><p>USD ——</p></body></html>",
        # Not the row "buy USD sell": guessing here is how a EUR rate became the dollar's.
        "<p>USD 497,50 500.30</p>",
        "<p>USD 439.3 441.9</p><p>EUR 500.5 504.5</p>",
        # Only the National Bank's block: that is a different rate, not the exchange office's.
        "<p>на 29 сентября 2026</p><div>USD 441.77 тенге</div>",
        # Sell below buy, or a gap no exchange office has: two unrelated numbers.
        "<td>441.9</td><td>USD</td><td>439.3</td>",
        "<td>300</td><td>USD</td><td>440</td>",
        # Scripts are not the page, and 30 is too small to be a rate.
        "<script>439.3 USD 441.9</script>",
        "<td>30</td><td>USD</td><td>31</td>",
    ],
)
def test_parse_refuses_what_is_not_the_usd_row(page):
    with pytest.raises(rates.RateError, match="не найден курс"):
        rates.parse_usd_rate(page)


@pytest.fixture
def source(monkeypatch):
    """The page mig.kz returns: source.page = "..." or source.error = OSError(...)."""

    class Source:
        page: str = mig_page()
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
    assert r["usd_rate"] == 441.9
    assert r["updated_at"] is not None
    # The second call in the same hours doesn't go to the source again.
    client.get("/api/currency")
    assert source.calls == 1
    # The public answer has no parts of the rate.
    assert set(r) == {"usd_rate", "updated_at"}


def test_a_dead_source_keeps_the_last_rate_and_says_why(client, auth, db, source):
    admin = auth(UserRole.admin)
    assert client.get("/api/currency").json()["usd_rate"] == 441.9

    row = db.get(ExchangeRate, 1)
    row.checked_at = datetime.now(UTC) - timedelta(hours=4)
    db.commit()
    source.error = OSError("timed out")

    assert client.get("/api/currency").json()["usd_rate"] == 441.9
    state = client.get("/api/admin/currency", headers=admin).json()
    assert state["source_error"] == "mig.kz не отвечает"
    assert state["source_rate"] == 441.9

    # After a failure it tries again in 15 minutes, not hours.
    row = db.get(ExchangeRate, 1)
    db.refresh(row)
    row.checked_at = datetime.now(UTC) - timedelta(minutes=16)
    db.commit()
    source.error = None
    source.page = mig_page("444", "446")
    assert client.get("/api/currency").json()["usd_rate"] == 446
    assert client.get("/api/admin/currency", headers=admin).json()["source_error"] is None


def test_a_wild_jump_is_a_misread_not_a_rate(client, auth, source):
    admin = auth(UserRole.admin)
    client.get("/api/currency")
    source.page = mig_page("880", "890")
    r = client.post("/api/admin/currency/refresh", headers=admin)
    assert r.status_code == 502
    assert "похоже на сбой" in r.json()["detail"]
    state = client.get("/api/admin/currency", headers=admin).json()
    assert state["source_rate"] == 441.9
    assert "890" in state["source_error"]


def test_no_rate_at_all_until_the_source_answers(client, source):
    source.error = OSError("down")
    assert client.get("/api/currency").json() == {"usd_rate": None, "updated_at": None}


def test_admin_shift_is_added_to_the_mig_rate(client, auth, db, source):
    admin = auth(UserRole.admin)
    client.get("/api/currency")

    r = client.put("/api/admin/currency", json={"adjustment": 7.5}, headers=admin).json()
    assert (r["source_rate"], r["adjustment"], r["effective_rate"]) == (441.9, 7.5, 449.4)
    assert client.get("/api/currency").json()["usd_rate"] == 449.4

    r = client.put("/api/admin/currency", json={"adjustment": -10}, headers=admin).json()
    assert r["effective_rate"] == 431.9

    # The shift stays when mig.kz moves: the site follows mig.kz with it.
    row = db.get(ExchangeRate, 1)
    row.checked_at = datetime.now(UTC) - timedelta(hours=4)
    db.commit()
    source.page = mig_page("444", "446")
    assert client.get("/api/currency").json()["usd_rate"] == 436
    r = client.post("/api/admin/currency/refresh", headers=admin).json()
    assert (r["source_rate"], r["adjustment"], r["effective_rate"]) == (446, -10, 436)


def test_a_typed_rate_does_not_replace_mig(client, auth, source):
    admin = auth(UserRole.admin)
    client.get("/api/currency")
    # Once mig.kz has answered, a rate typed by hand is not kept: mig.kz plus the shift wins.
    r = client.put(
        "/api/admin/currency", json={"adjustment": 5, "manual_rate": 512}, headers=admin
    ).json()
    assert (r["manual_rate"], r["effective_rate"]) == (None, 446.9)
    assert client.get("/api/currency").json()["usd_rate"] == 446.9


def test_a_manual_rate_stands_in_until_mig_answers(client, auth, db, source):
    admin = auth(UserRole.admin)
    source.error = OSError("down")
    r = client.put(
        "/api/admin/currency", json={"adjustment": 5, "manual_rate": 495}, headers=admin
    ).json()
    assert (r["manual_rate"], r["effective_rate"]) == (495, 495)
    assert client.get("/api/currency").json()["usd_rate"] == 495

    # The site keeps asking mig.kz (a manual rate doesn't stop it); the first answer replaces
    # the manual rate, and the shift applies.
    row = db.get(ExchangeRate, 1)
    row.checked_at = datetime.now(UTC) - timedelta(minutes=16)
    db.commit()
    source.error = None
    assert client.get("/api/currency").json()["usd_rate"] == 446.9
    state = client.get("/api/admin/currency", headers=admin).json()
    assert (state["manual_rate"], state["source_rate"], state["effective_rate"]) == (
        None,
        441.9,
        446.9,
    )


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
