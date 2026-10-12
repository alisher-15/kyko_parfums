import io
from decimal import Decimal

from openpyxl import load_workbook

from app.models import ProductVariant, UserRole, VariantBarcode
from app.services.markups import markup_of
from tests.test_admin import xlsx

EAN = "4600000000017"


def _import(client, h, rows):
    files = {"file": ("c.xlsx", xlsx(rows), "application/octet-stream")}
    r = client.post("/api/admin/import/catalog", files=files, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["errors"] == []
    return r.json()


def test_markup_of():
    assert markup_of(Decimal("16000"), Decimal("10000")) == Decimal("60")
    assert markup_of(Decimal("15990"), Decimal("9999.45")) == Decimal("59.9088")
    assert markup_of(None, Decimal("10000")) is None
    assert markup_of(Decimal("16000"), None) is None
    assert markup_of(Decimal("16000"), Decimal("0")) is None
    # A price 100 000 times the cost is a typo in the cost.
    assert markup_of(Decimal("1000000"), Decimal("1")) is None


def test_import_remembers_markups_of_the_four_numbers(client, auth, db):
    h = auth(UserRole.admin)
    header = ["Бренд", "Название", "Тип", "Объём", "Тестер", "Себестоимость", "Розница", "Опт",
              "Крупный опт"]  # fmt: skip
    _import(
        client,
        h,
        [
            header,
            ["Chanel", "Chance", "EDT", 50, "нет", 10000, 16000, 13000, 12000],
            ["Chanel", "Chance", "EDT", 100, "нет", None, 30000, None, None],
        ],
    )
    v50, v100 = sorted(db.query(ProductVariant).all(), key=lambda v: v.volume_ml)
    assert (v50.retail_markup, v50.wholesale_markup, v50.bulk_markup) == (60, 30, 20)
    # No cost: nothing to remember.
    assert (v100.retail_markup, v100.wholesale_markup) == (None, None)

    # New prices in a file: the volume remembers the new markups; empty cells keep the old price.
    _import(client, h, [header, ["Chanel", "Chance", "EDT", 50, "нет", None, 17000, None, None]])
    db.expire_all()
    v50 = db.get(ProductVariant, v50.id)
    assert (v50.retail_markup, v50.wholesale_markup, v50.bulk_markup) == (70, 30, 20)


def test_export_has_the_cost_next_to_the_prices(client, auth, db):
    h = auth(UserRole.admin)
    header = ["Бренд", "Название", "Тип", "Объём", "Себестоимость", "Розница", "Опт"]
    _import(client, h, [header, ["Chanel", "Chance", "EDT", 50, 9999.45, 15990, 13000]])

    r = client.get("/api/admin/import/export", headers=h)
    sheet = load_workbook(io.BytesIO(r.content)).active
    titles, row = [list(r) for r in sheet.iter_rows(values_only=True)]
    start = titles.index("Себестоимость")
    assert titles[start : start + 4] == [
        "Себестоимость",
        "Розничная цена",
        "Оптовая цена",
        "Цена крупный опт",
    ]
    assert row[start : start + 4] == [9999.45, 15990, 13000, None]


def test_editing_prices_by_hand_remembers_markups(client, auth, catalog, db):
    h = auth(UserRole.admin)
    url = f"/api/admin/variants/{catalog['coco50'].id}"  # 100 / 80 / 70, no cost
    r = client.patch(url, json={"cost_price": 50}, headers=h).json()
    assert (r["retail_markup"], r["wholesale_markup"], r["bulk_markup"]) == (100, 60, 40)
    r = client.patch(url, json={"retail_price": 120}, headers=h).json()
    assert (r["retail_markup"], r["wholesale_markup"]) == (140, 60)

    # Changing anything else leaves them as they are.
    db.query(ProductVariant).filter_by(id=catalog["coco50"].id).update({"retail_markup": 55})
    db.commit()
    assert client.patch(url, json={"stock": 3}, headers=h).json()["retail_markup"] == 55


def test_new_volumes_remember_markups(client, auth, catalog):
    h = auth(UserRole.admin)
    body = {"volume_ml": 30, "retail_price": 15000, "cost_price": 10000}
    r = client.post(f"/api/admin/products/{catalog['coco'].id}/variants", json=body, headers=h)
    assert r.json()["retail_markup"] == 50

    variant = {
        "volume_ml": 50,
        "retail_price": 26000,
        "wholesale_price": 22000,
        "cost_price": 20000,
    }
    payload = {"brand_id": catalog["chanel"].id, "name": "Chance", "variants": [variant]}
    v = client.post("/api/admin/products", json=payload, headers=h).json()["variants"][0]
    assert (v["retail_markup"], v["wholesale_markup"], v["bulk_markup"]) == (30, 10, None)


def test_a_receipt_keeps_the_markups(client, auth, catalog, db):
    """A receipt moves the average cost, not the markups the prices were set with."""
    h = auth(UserRole.admin)
    coco50 = catalog["coco50"]
    db.add(VariantBarcode(variant_id=coco50.id, code=EAN))
    db.commit()
    client.patch(f"/api/admin/variants/{coco50.id}", json={"cost_price": 50}, headers=h)
    rid = client.post("/api/admin/receipts", json={}, headers=h).json()["id"]
    line = client.post(f"/api/admin/receipts/{rid}/scan", json={"code": EAN}, headers=h).json()
    item = line["items"][0]
    client.patch(
        f"/api/admin/receipts/{rid}/lines/{item['id']}",
        json={"quantity": 10, "cost_price": 70},
        headers=h,
    )
    assert client.post(f"/api/admin/receipts/{rid}/post", headers=h).status_code == 200
    db.expire_all()
    v = db.get(ProductVariant, coco50.id)
    assert v.cost_price == Decimal("60.00")  # (10×50 + 10×70) / 20
    assert (v.retail_markup, v.wholesale_markup, v.bulk_markup) == (100, 60, 40)
