import io

import pytest
from PIL import Image, ImageDraw

from app.models import UserRole
from app.services import images, storage
from app.services.images import MARKER, prepare_upload


def photo(size, bg, bottle_box, fmt="JPEG", mode="RGB", exif_orientation=None) -> bytes:
    im = Image.new(mode, size, bg)
    ImageDraw.Draw(im).rectangle(
        bottle_box, fill=(40, 30, 20) if mode == "RGB" else (40, 30, 20, 255)
    )
    buf = io.BytesIO()
    extra = {}
    if exif_orientation:
        exif = Image.Exif()
        exif[0x0112] = exif_orientation
        extra["exif"] = exif
    im.save(buf, fmt, **extra)
    return buf.getvalue()


def dark_box(im: Image.Image) -> tuple[int, int, int, int]:
    return im.convert("L").point(lambda v: 255 if v < 128 else 0).getbbox()


def test_product_photo_becomes_a_white_square_with_the_bottle_at_the_same_scale():
    # A phone photo: greyish-white background, small bottle off-centre.
    data = photo((1200, 1600), (236, 234, 238), (100, 200, 400, 1100))
    p = prepare_upload(data, "product")
    assert (p.normalized, p.note, p.ext, p.content_type) == (True, None, ".jpg", "image/jpeg")
    im = Image.open(io.BytesIO(p.data))
    assert im.size == (600, 600)
    assert im.info.get("comment") in (MARKER, MARKER.encode())
    assert im.getpixel((5, 5)) == (255, 255, 255)
    left, top, right, bottom = dark_box(im)
    # The longer side of the bottle takes 1 - 2 × 7% of the frame, centred.
    assert abs((bottom - top) - 516) <= 3
    assert abs((left + right) / 2 - 300) <= 3 and abs((top + bottom) / 2 - 300) <= 3


def test_phone_rotation_is_applied():
    # Stored landscape with "rotate 90°" in EXIF: the bottle is tall once rotated.
    data = photo((1600, 1200), (250, 250, 250), (200, 500, 1100, 700), exif_orientation=6)
    im = Image.open(io.BytesIO(prepare_upload(data, "product").data))
    left, top, right, bottom = dark_box(im)
    assert bottom - top > right - left


def test_uneven_background_is_kept_with_a_note():
    im = Image.new("RGB", (800, 800), (250, 250, 250))
    ImageDraw.Draw(im).rectangle((0, 600, 800, 800), fill=(120, 80, 40))  # a table
    buf = io.BytesIO()
    im.save(buf, "JPEG")
    p = prepare_upload(buf.getvalue(), "product")
    assert p.normalized is False
    assert "фон неоднородный" in p.note
    assert Image.open(io.BytesIO(p.data)).size == (800, 800)


def test_transparent_png_bottle_goes_on_white():
    data = photo((500, 900), (0, 0, 0, 0), (150, 100, 350, 800), fmt="PNG", mode="RGBA")
    p = prepare_upload(data, "product")
    im = Image.open(io.BytesIO(p.data))
    assert p.normalized and im.size == (600, 600) and im.getpixel((5, 5)) == (255, 255, 255)


def test_banners_and_logos_are_only_made_smaller():
    banner = photo((3200, 1200), (200, 60, 60), (100, 100, 300, 300))
    p = prepare_upload(banner, "original")
    assert (p.normalized, p.ext) == (False, ".jpg")
    assert Image.open(io.BytesIO(p.data)).size == (1600, 600)

    logo = photo((400, 200), (0, 0, 0, 0), (10, 10, 100, 100), fmt="PNG", mode="RGBA")
    p = prepare_upload(logo, "original")
    assert (p.ext, Image.open(io.BytesIO(p.data)).mode) == (".png", "RGBA")


def test_not_an_image():
    with pytest.raises(images.NotAnImage):
        prepare_upload(b"\x89PNG\r\n\x1a\n" + b"0" * 100, "product")


def test_upload_to_local_media(client, auth, tmp_path, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "media_dir", tmp_path)
    h = auth(UserRole.admin)
    data = photo((800, 1000), (255, 255, 255), (300, 100, 500, 900))
    r = client.post("/api/admin/uploads", files={"file": ("a.jpg", data, "image/jpeg")}, headers=h)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["normalized"] is True and body["note"] is None
    assert body["url"].startswith("/media/products/") and body["url"].endswith(".jpg")
    saved = Image.open(tmp_path / "products" / body["url"].rsplit("/", 1)[1])
    assert saved.size == (600, 600)

    # A banner keeps its shape.
    banner = photo((2000, 800), (30, 30, 30), (100, 100, 300, 300))
    r = client.post(
        "/api/admin/uploads?kind=original",
        files={"file": ("b.jpg", banner, "image/jpeg")},
        headers=h,
    )
    saved = Image.open(tmp_path / "products" / r.json()["url"].rsplit("/", 1)[1])
    assert saved.size == (1600, 640)

    for content, ctype in ((b"not an image", "image/png"), (data, "application/pdf")):
        r = client.post("/api/admin/uploads", files={"file": ("a.png", content, ctype)}, headers=h)
        assert r.status_code == 415


class FakeBucket:
    def __init__(self, fail=False):
        self.objects = {}
        self.fail = fail

    def put_object(self, *, Bucket, Key, Body, ContentType, CacheControl):  # noqa: N803
        if self.fail:
            raise ConnectionError("R2 is down")
        self.objects[(Bucket, Key)] = (Body, ContentType)


@pytest.fixture
def r2(monkeypatch):
    from app.config import get_settings

    s = get_settings()
    for key, value in {
        "r2_endpoint": "https://acc.r2.cloudflarestorage.com",
        "r2_access_key_id": "key",
        "r2_secret_access_key": "secret",
        "r2_bucket": "kyko-photos",
        "r2_public_url": "https://pub-123.r2.dev/",
    }.items():
        monkeypatch.setattr(s, key, value)
    bucket = FakeBucket()
    monkeypatch.setattr(storage, "_client", lambda: bucket)
    return bucket


def test_upload_goes_to_r2_when_configured(client, auth, r2):
    data = photo((800, 1000), (255, 255, 255), (300, 100, 500, 900))
    r = client.post(
        "/api/admin/uploads",
        files={"file": ("a.jpg", data, "image/jpeg")},
        headers=auth(UserRole.admin),
    )
    assert r.status_code == 201, r.text
    url = r.json()["url"]
    assert url.startswith("https://pub-123.r2.dev/products/") and url.endswith(".jpg")
    (bucket, key), (body, ctype) = next(iter(r2.objects.items()))
    assert (bucket, ctype) == ("kyko-photos", "image/jpeg")
    assert url.endswith(key) and Image.open(io.BytesIO(body)).size == (600, 600)


def test_bucket_error_is_reported(client, auth, r2):
    r2.fail = True
    data = photo((800, 1000), (255, 255, 255), (300, 100, 500, 900))
    r = client.post(
        "/api/admin/uploads",
        files={"file": ("a.jpg", data, "image/jpeg")},
        headers=auth(UserRole.admin),
    )
    assert r.status_code == 502
