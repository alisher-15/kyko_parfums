"""Banners and stories from templates: POST /api/admin/creatives/render."""

import base64
import io

import pytest
from PIL import Image, ImageDraw

from app.config import get_settings
from app.models import UserRole
from app.services import creatives

URL = "/api/admin/creatives/render"


@pytest.fixture
def media(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "media_dir", tmp_path)
    return tmp_path


def bottle_photo(media, name: str, colour=(20, 60, 160)) -> str:
    """A product photo in the shop format: a dark bottle on a white 600×600 square."""
    im = Image.new("RGB", (600, 600), (255, 255, 255))
    ImageDraw.Draw(im).rectangle((220, 120, 380, 540), fill=colour)
    (media / "products").mkdir(exist_ok=True)
    im.save(media / "products" / name, "JPEG")
    return f"/media/products/{name}"


def decode(preview: str) -> Image.Image:
    head, data = preview.split(",", 1)
    assert head == "data:image/jpeg;base64"
    return Image.open(io.BytesIO(base64.b64decode(data)))


@pytest.mark.parametrize(("fmt", "size"), [("banner", (1200, 800)), ("story", (1080, 1920))])
@pytest.mark.parametrize("theme", ["jewel", "dark", "light", "gold"])
def test_preview_has_the_format_size(client, auth, catalog, media, db, fmt, size, theme):
    catalog["coco"].image_url = bottle_photo(media, "coco.jpg")
    db.commit()
    r = client.post(
        URL,
        json={
            "format": fmt,
            "theme": theme,
            "title": "Новогодняя неделя Chanel",
            "subtitle": "Подарки к праздникам",
            "badge": "−15%",
            "note": "до 31 декабря · от 30 000 ₸",
            "product_ids": [catalog["coco"].id],
        },
        headers=auth(UserRole.admin),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["width"], body["height"]) == size
    assert body["url"] is None and body["missing_photos"] == []
    assert decode(body["preview"]).size == size


def test_the_bottle_is_on_the_picture(client, auth, catalog, media, db):
    """The light theme melts the photo's white into the picture: the bottle's own blue shows."""
    catalog["coco"].image_url = bottle_photo(media, "coco.jpg", colour=(10, 40, 200))
    db.commit()
    r = client.post(
        URL,
        json={"theme": "light", "title": "Синий", "product_ids": [catalog["coco"].id]},
        headers=auth(UserRole.admin),
    )
    im = decode(r.json()["preview"]).convert("RGB")
    blue = sum(1 for r_, g, b in im.get_flattened_data() if b > 150 and r_ < 60 and g < 90)
    assert blue > 10_000


def test_the_jewel_box_banner(client, auth, catalog, media, db):
    """«Шкатулка», the default: a velvet corner, and the bottle melted into a light studio
    backdrop (its own blue, no white square around it)."""
    catalog["coco"].image_url = bottle_photo(media, "coco.jpg", colour=(10, 40, 200))
    db.commit()
    r = client.post(
        URL,
        json={"title": "Синий", "product_ids": [catalog["coco"].id]},
        headers=auth(UserRole.admin),
    )
    im = decode(r.json()["preview"]).convert("RGB")
    assert max(im.getpixel((4, 4))) < 70  # velvet
    blue = sum(1 for r_, g, b in im.get_flattened_data() if b > 150 and r_ < 60 and g < 90)
    assert blue > 10_000
    # The backdrop under the bottle is light, not the velvet ground.
    assert min(im.getpixel((1200 - 64 - 30, 800 - 64 - 20))) > 200


def test_save_stores_the_picture(client, auth, catalog, media):
    r = client.post(
        f"{URL}?save=true",
        json={"format": "story", "title": "Только текст"},
        headers=auth(UserRole.admin),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["preview"] is None
    assert body["url"].startswith("/media/creatives/") and body["url"].endswith(".jpg")
    saved = Image.open(media / "creatives" / body["url"].rsplit("/", 1)[1])
    assert saved.size == (1080, 1920)


def test_a_photo_that_cannot_be_read_leaves_its_place_empty(client, auth, catalog, media, db):
    catalog["coco"].image_url = "/media/products/gone.jpg"
    catalog["sauvage"].image_url = bottle_photo(media, "sauvage.jpg")
    db.commit()
    ids = [catalog["coco"].id, catalog["sauvage"].id]
    r = client.post(URL, json={"title": "Двое", "product_ids": ids}, headers=auth(UserRole.admin))
    assert r.status_code == 200, r.text
    assert r.json()["missing_photos"] == [catalog["coco"].id]


def test_a_volume_photo_stands_in_for_the_product(client, auth, catalog, media, db):
    catalog["coco"].image_url = None
    catalog["coco100"].photo_url = bottle_photo(media, "coco100.jpg")
    db.commit()
    r = client.post(
        URL,
        json={"title": "Флакон", "product_ids": [catalog["coco"].id]},
        headers=auth(UserRole.admin),
    )
    assert r.json()["missing_photos"] == []


def test_checks(client, auth, catalog):
    h = auth(UserRole.admin)
    assert client.post(URL, json={"title": "  "}, headers=h).status_code == 422
    r = client.post(URL, json={"title": "Нет товара", "product_ids": [999_999]}, headers=h)
    assert r.status_code == 404
    four = [catalog["coco"].id, catalog["sauvage"].id, catalog["no_price"].id, 1]
    assert (
        client.post(URL, json={"title": "Много", "product_ids": four}, headers=h).status_code == 422
    )
    # The owner's tool: other staff and customers can't use it.
    for role in (UserRole.cashier, UserRole.warehouse, UserRole.retail):
        assert client.post(URL, json={"title": "Х"}, headers=auth(role)).status_code == 403


def test_long_text_fits_the_picture():
    """A title too long for the lines it may take is cut with an ellipsis, never drawn off the
    picture."""
    title = "Очень длинное название акции " * 8
    size, lines = creatives._fit(title, creatives.SERIF, 540, range(92, 47, -4), 3)
    assert size == 48 and len(lines) == 3 and lines[-1].endswith("…")
    assert all(creatives._width(line, creatives.SERIF, size) <= 540 for line in lines)


def test_tenge_sign_is_drawn_with_a_font_that_has_it():
    # Manrope has no ₸: that character goes to the serif.
    runs = creatives._runs("от 30 000 ₸", creatives.SANS)
    assert runs[-1] == ("₸", creatives.SERIF)
    assert runs[0][1] == creatives.SANS
