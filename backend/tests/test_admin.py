import io
from decimal import Decimal

from openpyxl import Workbook
from sqlalchemy import select

from app.models import Product, ProductVariant, User, UserRole
from tests.conftest import login, make_user
from tests.test_orders import CHECKOUT


def xlsx(rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_admin_endpoints_require_admin(client, auth):
    assert client.get("/api/admin/stats").status_code == 401
    assert client.get("/api/admin/stats", headers=auth(UserRole.wholesale)).status_code == 403
    assert client.get("/api/admin/stats", headers=auth(UserRole.admin)).status_code == 200


def test_brand_crud(client, auth, catalog):
    h = auth(UserRole.admin)
    r = client.post("/api/admin/brands", json={"name": " Kilian "}, headers=h)
    assert r.status_code == 201
    brand_id = r.json()["id"]
    assert r.json()["name"] == "Kilian"
    assert client.post("/api/admin/brands", json={"name": "Kilian"}, headers=h).status_code == 409

    r = client.patch(f"/api/admin/brands/{brand_id}", json={"name": "By Kilian"}, headers=h)
    assert r.json()["name"] == "By Kilian"
    # Brand with products cannot be deleted.
    r = client.delete(f"/api/admin/brands/{catalog['dior'].id}", headers=h)
    assert r.status_code == 409
    assert client.delete(f"/api/admin/brands/{brand_id}", headers=h).status_code == 204


def test_product_and_variant_crud(client, auth, catalog):
    h = auth(UserRole.admin)
    payload = {
        "brand_id": catalog["chanel"].id,
        "name": "Chance",
        "type": "EDT",
        "gender": "female",
        "variants": [
            {"volume_ml": 50, "retail_price": 100, "wholesale_price": 90, "stock": 3},
            {"volume_ml": 100, "retail_price": 180, "sku": ""},
        ],
    }
    r = client.post("/api/admin/products", json=payload, headers=h)
    assert r.status_code == 201, r.text
    product = r.json()
    assert [v["volume_ml"] for v in product["variants"]] == [50, 100]
    assert product["variants"][1]["sku"] is None

    # Duplicate volume.
    r = client.post(
        f"/api/admin/products/{product['id']}/variants",
        json={"volume_ml": 50, "retail_price": 1},
        headers=h,
    )
    assert r.status_code == 409

    # Price order validation (wholesale must not exceed retail).
    r = client.post(
        f"/api/admin/products/{product['id']}/variants",
        json={"volume_ml": 30, "retail_price": 50, "wholesale_price": 60},
        headers=h,
    )
    assert r.status_code == 422
    vid = product["variants"][0]["id"]
    r = client.patch(f"/api/admin/variants/{vid}", json={"wholesale_price": 150}, headers=h)
    assert r.status_code == 422
    r = client.patch(f"/api/admin/variants/{vid}", json={"stock": 11, "bulk_price": 70}, headers=h)
    assert r.status_code == 200
    assert (r.json()["stock"], r.json()["bulk_price"]) == (11, 70)

    r = client.patch(
        f"/api/admin/products/{product['id']}",
        json={"is_active": False, "description": "Новый"},
        headers=h,
    )
    assert r.json()["is_active"] is False
    assert client.get(f"/api/products/{product['id']}").status_code == 404

    r = client.get("/api/admin/products", params={"q": "chance"}, headers=h)
    assert r.json()["total"] == 1
    r = client.get("/api/admin/products", params={"no_variants": True}, headers=h)
    assert [p["name"] for p in r.json()["items"]] == ["Hidden", "J'adore"]

    assert client.delete(f"/api/admin/variants/{vid}", headers=h).status_code == 204
    assert client.delete(f"/api/admin/products/{product['id']}", headers=h).status_code == 204


def test_deleting_product_keeps_order_history(client, auth, catalog, db):
    buyer = auth()
    order = client.post(
        "/api/orders",
        json={**CHECKOUT, "items": [{"variant_id": catalog["coco50"].id, "quantity": 1}]},
        headers=buyer,
    ).json()
    h = auth(UserRole.admin)
    assert client.delete(f"/api/admin/products/{catalog['coco'].id}", headers=h).status_code == 204
    item = client.get(f"/api/orders/{order['id']}", headers=buyer).json()["items"][0]
    assert item["variant_id"] is None
    assert item["product_name"] == "Coco Mademoiselle"


def test_user_management(client, auth, db):
    h = auth(UserRole.admin)
    make_user(db, "shop@example.com")
    shop_headers = login(client, "shop@example.com")
    client.post(
        "/api/me/wholesale-request",
        json={"company_name": "ТОО Парфюм", "phone": "+7 700"},
        headers=shop_headers,
    )

    r = client.get("/api/admin/users", params={"wholesale_requested": True}, headers=h)
    assert [u["email"] for u in r.json()["items"]] == ["shop@example.com"]
    uid = r.json()["items"][0]["id"]

    r = client.patch(f"/api/admin/users/{uid}", json={"role": "wholesale"}, headers=h)
    assert r.json()["role"] == "wholesale"
    assert r.json()["wholesale_requested"] is False
    # The new role applies immediately to existing tokens.
    assert client.get("/api/me", headers=shop_headers).json()["role"] == "wholesale"

    r = client.patch(f"/api/admin/users/{uid}", json={"is_active": False}, headers=h)
    assert r.json()["is_active"] is False
    assert client.get("/api/me", headers=shop_headers).status_code == 401

    r = client.post(
        "/api/admin/users",
        json={"email": "Bulk@Example.com", "password": "password123", "role": "bulk_wholesale"},
        headers=h,
    )
    assert r.status_code == 201
    assert r.json()["email"] == "bulk@example.com"
    login(client, "bulk@example.com")


def test_admin_cannot_demote_or_delete_self(client, db):
    admin = make_user(db, "admin@example.com", UserRole.admin)
    h = login(client, "admin@example.com")
    r = client.patch(f"/api/admin/users/{admin.id}", json={"role": "retail"}, headers=h)
    assert r.status_code == 409
    assert client.delete(f"/api/admin/users/{admin.id}", headers=h).status_code == 409


def test_order_status_workflow(client, auth, catalog, db):
    buyer = auth()
    order = client.post(
        "/api/orders",
        json={**CHECKOUT, "items": [{"variant_id": catalog["coco50"].id, "quantity": 4}]},
        headers=buyer,
    ).json()
    h = auth(UserRole.admin)
    url = f"/api/admin/orders/{order['id']}"

    r = client.get("/api/admin/orders", params={"status": "new"}, headers=h)
    assert r.json()["items"][0]["items_count"] == 4
    assert r.json()["items"][0]["user_email"].endswith("@example.com")

    r = client.patch(url, json={"status": "processing", "admin_note": "Позвонить"}, headers=h)
    assert (r.json()["status"], r.json()["admin_note"]) == ("processing", "Позвонить")
    assert client.patch(url, json={"status": "shipped"}, headers=h).status_code == 200
    # Customer can no longer cancel.
    assert client.post(f"/api/orders/{order['id']}/cancel", headers=buyer).status_code == 409

    assert client.patch(url, json={"status": "cancelled"}, headers=h).status_code == 200
    db.expire_all()
    assert db.get(ProductVariant, catalog["coco50"].id).stock == 10
    # Final state.
    assert client.patch(url, json={"status": "new"}, headers=h).status_code == 409


def test_pricing_settings(client, auth):
    h = auth(UserRole.admin)
    payload = {
        "mode": "item_quantity",
        "wholesale_min_order_amount": 100000,
        "bulk_min_order_amount": 500000,
        "wholesale_min_item_qty": 3,
        "bulk_min_item_qty": 10,
    }
    r = client.put("/api/admin/settings/pricing", json=payload, headers=h)
    assert r.status_code == 200
    assert r.json()["mode"] == "item_quantity"
    r = client.put(
        "/api/admin/settings/pricing", json={**payload, "bulk_min_item_qty": 2}, headers=h
    )
    assert r.status_code == 422


def test_upload_image(client, auth, tmp_path, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "media_dir", tmp_path)
    h = auth(UserRole.admin)
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    r = client.post("/api/admin/uploads", files={"file": ("a.png", png, "image/png")}, headers=h)
    assert r.status_code == 201
    url = r.json()["url"]
    assert url.startswith("/media/products/") and url.endswith(".png")
    assert (tmp_path / "products" / url.rsplit("/", 1)[1]).read_bytes() == png

    r = client.post(
        "/api/admin/uploads", files={"file": ("a.png", b"not an image", "image/png")}, headers=h
    )
    assert r.status_code == 415


def test_import_excel(client, auth, db):
    h = auth(UserRole.admin)
    # fmt: off
    rows = [
        ["Каталог ароматов"],  # title row before the header
        [],
        ["Бренд", "Название", "Тип", "Категория", "Пол", "Стойкость", "Верхние ноты",
         "Ноты сердца", "Базовые ноты", "Описание", "Объём, мл", "Цена", "Опт", "Крупный опт",
         "Остаток", "Лишняя колонка"],
        ["Chanel", "Chance", "Eau de Toilette", "Цветочные", "Женский", "Средняя", "Розовый перец",
         "Жасмин", "Пачули", "Черновик", None, None, None, None, None, "x"],
        ["Chanel", "Chance", "EDT", None, None, None, None, None, None, None,
         "50 мл", "45 000", "40000", "35000", 5, None],
        ["Dior", "Sauvage", "туалетная вода", "Фужерные", "муж.", "4-6 ч", None, None, None, None,
         100, 60000.0, None, None, "3", None],
        ["Dior", "Bad", "EDP", None, "непонятно", None, None, None, None, None,
         None, None, None, None, None, None],
        ["", "Без бренда", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        ["Tom Ford", "Oud Wood", "Parfum", None, "Unisex", None, None, None, None, None,
         50, 100, 120, None, None, None],
    ]
    # fmt: on
    content = xlsx(rows)
    files = {"file": ("catalog.xlsx", content, "application/octet-stream")}

    dry = client.post("/api/admin/import/catalog?dry_run=true", files=files, headers=h).json()
    assert dry["dry_run"] is True
    assert db.query(Product).count() == 0

    report = client.post("/api/admin/import/catalog", files=files, headers=h).json()
    assert report["rows_total"] == 6
    assert report["brands_created"] == 3
    assert report["products_created"] == 3  # Chance, Sauvage, Oud Wood
    assert report["variants_created"] == 2
    assert report["unmapped_columns"] == ["Лишняя колонка"]
    errors = {e["row"]: e["error"] for e in report["errors"]}
    assert set(errors) == {7, 8, 9}
    assert "пол" in errors[7]
    assert "бренд" in errors[8]
    assert "Оптовая цена" in errors[9]

    chance = db.query(Product).filter_by(name="Chance").one()
    assert (chance.type, chance.gender.value, chance.category) == ("EDT", "female", "Цветочные")
    v = chance.variants[0]
    assert (v.volume_ml, v.retail_price, v.wholesale_price, v.bulk_price, v.stock) == (
        50,
        Decimal("45000.00"),
        Decimal("40000.00"),
        Decimal("35000.00"),
        5,
    )
    sauvage = db.query(Product).filter_by(name="Sauvage").one()
    assert (sauvage.type, sauvage.gender.value) == ("EDT", "male")

    # Re-import is idempotent.
    again = client.post("/api/admin/import/catalog", files=files, headers=h).json()
    assert (again["products_created"], again["products_updated"], again["variants_created"]) == (
        0,
        0,
        0,
    )
    assert db.query(Product).count() == 3


def test_import_csv_and_bad_file(client, auth):
    h = auth(UserRole.admin)
    csv_content = "Бренд;Название;Пол\nKilian;Angels' Share;унисекс\n".encode("cp1251")
    r = client.post(
        "/api/admin/import/catalog",
        files={"file": ("c.csv", csv_content, "text/csv")},
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["products_created"] == 1

    r = client.post(
        "/api/admin/import/catalog",
        files={"file": ("c.xlsx", b"garbage", "application/octet-stream")},
        headers=h,
    )
    assert r.status_code == 422
    r = client.post(
        "/api/admin/import/catalog",
        files={"file": ("c.csv", b"a;b\n1;2\n", "text/csv")},
        headers=h,
    )
    assert r.status_code == 422


def test_import_template_roundtrip(client, auth, db):
    h = auth(UserRole.admin)
    r = client.get("/api/admin/import/template", headers=h)
    assert r.status_code == 200
    report = client.post(
        "/api/admin/import/catalog",
        files={"file": ("t.xlsx", r.content, "application/octet-stream")},
        headers=h,
    ).json()
    assert report["errors"] == []
    assert (report["products_created"], report["variants_created"]) == (1, 3)
    # The template shows how to mark a tester: the 100 ml bottle and the 100 ml tester.
    assert report["tester_rows"] == 1
    variants = db.scalars(select(ProductVariant).order_by(ProductVariant.id)).all()
    kinds = [(v.volume_ml, v.is_tester) for v in variants]
    assert kinds == [(50, False), (100, False), (100, True)]


def test_stats(client, auth, catalog, db):
    h = auth(UserRole.admin)
    s = client.get("/api/admin/stats", headers=h).json()
    assert s["products_total"] == 4
    assert s["products_without_variants"] == 2
    assert s["users_by_role"]["admin"] == 1
    assert db.query(User).count() == 1


def test_bootstrap_from_env(db, monkeypatch):
    from app.cli import bootstrap

    monkeypatch.setenv("ADMIN_EMAIL", "Owner@Example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "ownerpass123")
    monkeypatch.setenv("SEED_DEMO", "true")
    bootstrap()
    bootstrap()  # second start: nothing is duplicated or overwritten
    admin = db.query(User).filter_by(email="owner@example.com").one()
    assert admin.role == UserRole.admin
    assert db.query(Product).count() == 20
    assert db.query(ProductVariant).filter_by(is_tester=True).count() == 3
    assert db.query(User).count() == 4  # admin + 3 demo accounts


def test_seed_demo_twice_keeps_one_bottle_and_one_tester(db):
    from app.seed import seed_demo

    seed_demo()
    seed_demo()
    variants = db.scalars(select(ProductVariant)).all()
    kinds = [(v.product_id, v.volume_ml, v.is_tester) for v in variants]
    assert len(kinds) == len(set(kinds))
    assert sum(v.is_tester for v in variants) == 3


def test_database_url_gets_psycopg_driver():
    from app.config import Settings

    s = Settings(database_url="postgres://u:p@h:5432/d")
    assert s.database_url == "postgresql+psycopg://u:p@h:5432/d"
    s = Settings(database_url="postgresql://u:p@h/d")
    assert s.database_url == "postgresql+psycopg://u:p@h/d"
