"""The bottle photos that came with the code, moved to the bucket (services/bottles.py)."""

import pytest

from app.cli import main
from app.config import get_settings
from app.models import Product, ProductVariant, UserRole
from app.services import bottles, storage
from tests.test_admin import xlsx

BUCKET = "https://pub-test.r2.dev"


@pytest.fixture
def bucket(monkeypatch):
    """R2 is set up; nothing really goes to it: saved files are collected."""
    s = get_settings()
    for name, value in (
        ("r2_endpoint", "https://acc.r2.cloudflarestorage.com"),
        ("r2_access_key_id", "id"),
        ("r2_secret_access_key", "secret"),
        ("r2_bucket", "kyko"),
        ("r2_public_url", BUCKET + "/"),
    ):
        monkeypatch.setattr(s, name, value)
    saved: list[tuple[str, str]] = []
    monkeypatch.setattr(
        storage, "save", lambda key, data, ctype: saved.append((key, ctype)) or f"{BUCKET}/{key}"
    )
    return saved


def test_a_bottle_link_is_the_buckets_copy_only_with_a_bucket(bucket, monkeypatch):
    assert bottles.bucket_url("/bottles/dior-sauvage.jpg") == f"{BUCKET}/bottles/dior-sauvage.jpg"
    assert bottles.bucket_url("https://cdn.example.com/x.jpg") == "https://cdn.example.com/x.jpg"
    assert bottles.bucket_url(None) is None
    monkeypatch.setattr(get_settings(), "r2_bucket", "")
    assert bottles.bucket_url("/bottles/dior-sauvage.jpg") == "/bottles/dior-sauvage.jpg"


def test_upload_takes_the_photos_of_the_folder(bucket, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"jpeg")
    (tmp_path / "b.PNG").write_bytes(b"png")
    (tmp_path / "notes.txt").write_text("not a photo")
    assert bottles.upload(tmp_path) == 2
    assert bucket == [("bottles/a.jpg", "image/jpeg"), ("bottles/b.PNG", "image/png")]


def test_relink_points_products_and_volumes_at_the_bucket(bucket, catalog, db):
    coco, sauvage = catalog["coco"], catalog["sauvage"]
    coco.image_url = "/bottles/chanel-coco.jpg"
    sauvage.image_url = "https://cdn.example.com/sauvage.jpg"
    catalog["coco50"].photo_url = "/bottles/chanel-coco-50.png"
    db.commit()

    assert bottles.relink(db) == 2
    db.commit()
    db.expire_all()
    assert db.get(Product, coco.id).image_url == f"{BUCKET}/bottles/chanel-coco.jpg"
    assert db.get(Product, sauvage.id).image_url == "https://cdn.example.com/sauvage.jpg"
    v = db.get(ProductVariant, catalog["coco50"].id)
    assert v.photo_url == f"{BUCKET}/bottles/chanel-coco-50.png"
    # Again: nothing left to move.
    assert bottles.relink(db) == 0


def test_an_old_export_imports_with_the_buckets_photos(bucket, client, auth, db):
    rows = [
        ["Бренд", "Название", "Тип", "Фото", "Объём, мл", "Цена"],
        ["Dior", "Sauvage", "EDT", "/bottles/dior-sauvage.jpg", 100, 60000],
    ]
    files = {"file": ("catalog.xlsx", xlsx(rows), "application/octet-stream")}
    r = client.post("/api/admin/import/catalog", files=files, headers=auth(UserRole.admin))
    assert r.status_code == 200, r.text
    assert db.query(Product).one().image_url == f"{BUCKET}/bottles/dior-sauvage.jpg"


def test_the_command_needs_r2(capsys):
    assert main(["photos-to-r2"]) == 1
    assert "R2 is not set up" in capsys.readouterr().err


def test_the_command_uploads_and_moves_the_links(bucket, catalog, db, tmp_path):
    (tmp_path / "chanel-coco.jpg").write_bytes(b"jpeg")
    catalog["coco"].image_url = "/bottles/chanel-coco.jpg"
    db.commit()
    assert main(["photos-to-r2", "--dir", str(tmp_path)]) == 0
    assert bucket == [("bottles/chanel-coco.jpg", "image/jpeg")]
    db.expire_all()
    assert db.get(Product, catalog["coco"].id).image_url == f"{BUCKET}/bottles/chanel-coco.jpg"
