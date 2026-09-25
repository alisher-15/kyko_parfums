"""Testers: the same perfume in plain packaging, sold next to the bottle of the same volume."""

from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import ProductVariant, UserRole
from tests.test_admin import xlsx
from tests.test_orders import CHECKOUT


@pytest.fixture
def tester(catalog, db):
    """A 100 ml tester of Coco Mademoiselle, cheaper than both bottles."""
    variant = ProductVariant(
        product_id=catalog["coco"].id,
        volume_ml=100,
        is_tester=True,
        stock=5,
        retail_price=Decimal("90.00"),
        wholesale_price=Decimal("70.00"),
        bulk_price=Decimal("60.00"),
    )
    db.add(variant)
    db.commit()
    return variant


def test_a_product_has_one_bottle_and_one_tester_per_volume(client, auth, catalog):
    h = auth(UserRole.admin)
    coco = catalog["coco"]
    url = f"/api/admin/products/{coco.id}/variants"

    r = client.post(url, json={"volume_ml": 100, "is_tester": True, "retail_price": 90}, headers=h)
    assert r.status_code == 201, r.text
    tester = r.json()
    assert (tester["volume_ml"], tester["is_tester"]) == (100, True)

    r = client.post(url, json={"volume_ml": 100, "is_tester": True, "retail_price": 90}, headers=h)
    assert (r.status_code, r.json()["detail"]) == (409, "У товара уже есть 100 мл, тестер")
    r = client.post(url, json={"volume_ml": 100, "retail_price": 90}, headers=h)
    assert (r.status_code, r.json()["detail"]) == (409, "У товара уже есть 100 мл")

    # A tester can become a bottle and change its volume, as long as nothing clashes.
    r = client.patch(f"/api/admin/variants/{tester['id']}", json={"volume_ml": 50}, headers=h)
    assert r.status_code == 200, r.text
    r = client.patch(f"/api/admin/variants/{tester['id']}", json={"is_tester": False}, headers=h)
    assert (r.status_code, r.json()["detail"]) == (409, "У товара уже есть 50 мл")
    r = client.patch(
        f"/api/admin/variants/{tester['id']}", json={"is_tester": None, "stock": 3}, headers=h
    )
    assert (r.status_code, r.json()["is_tester"], r.json()["stock"]) == (200, True, 3)

    product = client.get(f"/api/admin/products/{coco.id}", headers=h).json()
    assert [(v["volume_ml"], v["is_tester"]) for v in product["variants"]] == [
        (50, False),
        (100, False),
        (50, True),
    ]

    # A new product may come with a bottle and a tester of the same volume, not two bottles.
    body = {
        "brand_id": catalog["dior"].id,
        "name": "Fahrenheit",
        "variants": [
            {"volume_ml": 100, "retail_price": 50},
            {"volume_ml": 100, "is_tester": True, "retail_price": 40},
        ],
    }
    assert client.post("/api/admin/products", json=body, headers=h).status_code == 201
    body["name"] = "Dune"
    body["variants"][1]["is_tester"] = False
    assert client.post("/api/admin/products", json=body, headers=h).status_code == 422


def test_catalog_sells_testers_at_the_prices_of_the_role(client, auth, catalog, tester):
    coco = catalog["coco"]

    guest = client.get(f"/api/products/{coco.id}").json()
    assert [(v["volume_ml"], v["is_tester"]) for v in guest["variants"]] == [
        (50, False),
        (100, False),
        (100, True),
    ]
    t = guest["variants"][2]
    assert (t["price"], t["wholesale_price"], t["bulk_price"]) == (90, None, None)
    # The cheapest thing to buy is the tester; the bottle and the tester are one 100 ml volume.
    assert (guest["min_price"], guest["volumes"]) == (90, [50, 100])
    listed = client.get("/api/products", params={"q": "coco"}).json()["items"][0]
    assert (listed["min_price"], listed["volumes"]) == (90, [50, 100])

    wholesale = client.get(f"/api/products/{coco.id}", headers=auth(UserRole.wholesale)).json()
    t = wholesale["variants"][2]
    assert (t["price"], t["price_tier"], t["next_tier_price"]) == (70, "wholesale", 60)

    bulk = client.get(f"/api/products/{coco.id}", headers=auth(UserRole.bulk_wholesale)).json()
    assert bulk["variants"][2]["price"] == 60


def test_order_remembers_that_it_was_a_tester(client, auth, catalog, tester, db):
    buyer, admin = auth(UserRole.wholesale), auth(UserRole.admin)
    items = [
        {"variant_id": catalog["coco100"].id, "quantity": 1},
        {"variant_id": tester.id, "quantity": 2},
    ]

    quote = client.post("/api/cart/quote", json={"items": items}, headers=buyer).json()
    assert [(ln["volume_ml"], ln["is_tester"], ln["unit_price"]) for ln in quote["lines"]] == [
        (100, False, 120),
        (100, True, 70),
    ]

    order = client.post("/api/orders", json={**CHECKOUT, "items": items}, headers=buyer).json()
    assert [(i["volume_ml"], i["is_tester"]) for i in order["items"]] == [
        (100, False),
        (100, True),
    ]
    db.refresh(tester)
    assert tester.stock == 3

    # The manager removes the tester: the history names it, and the tester is back in stock.
    line = next(i for i in order["items"] if i["is_tester"])
    r = client.patch(
        f"/api/admin/orders/{order['id']}/items",
        json={"items": [{"order_item_id": line["id"], "quantity": 0}]},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    assert "Coco Mademoiselle, 100 мл, тестер — убрано" in r.json()["events"][-1]["message"]
    db.refresh(tester)
    assert tester.stock == 5

    # The order keeps saying "тестер" even if the variant is changed later.
    db.delete(tester)
    db.commit()
    mine = client.get(f"/api/orders/{order['id']}", headers=buyer).json()
    assert [(i["variant_id"], i["is_tester"]) for i in mine["items"]][1] == (None, True)


def test_till_and_warehouse_name_the_tester(client, auth, catalog, tester):
    h = auth(UserRole.admin)

    found = client.get("/api/admin/store/variants", params={"q": "coco"}, headers=h).json()
    assert [(v["volume_ml"], v["is_tester"]) for v in found] == [
        (50, False),
        (100, False),
        (100, True),
    ]

    sale = {"items": [{"variant_id": tester.id, "quantity": 1}]}
    quote = client.post("/api/admin/store/quote", json=sale, headers=h).json()
    assert quote["lines"][0]["is_tester"] is True
    order = client.post("/api/admin/store/sales", json=sale, headers=h).json()
    assert order["items"][0]["is_tester"] is True
    returned = client.post(
        f"/api/admin/orders/{order['id']}/returns",
        json={"items": [{"order_item_id": order["items"][0]["id"], "quantity": 1}]},
        headers=h,
    ).json()
    item = returned["returns"][0]["items"][0]
    assert item["product_label"] == "Chanel Coco Mademoiselle, 100 мл, тестер"

    rid = client.post("/api/admin/receipts", json={}, headers=h).json()["id"]
    receipt = client.post(
        f"/api/admin/receipts/{rid}/lines", json={"variant_id": tester.id}, headers=h
    ).json()
    assert receipt["items"][0]["label"] == "Chanel Coco Mademoiselle, 100 мл, тестер"

    # The tester has barcodes of its own; a code of the tester can't go on the bottle too.
    code = "3145891253317"
    url = "/api/admin/variants/{}/barcodes"
    assert client.post(url.format(tester.id), json={"code": code}, headers=h).status_code == 201
    r = client.post(url.format(catalog["coco100"].id), json={"code": code}, headers=h)
    assert r.status_code == 409
    assert "Coco Mademoiselle, 100 мл, тестер" in r.json()["detail"]
    assert client.get(f"/api/admin/barcodes/{code}", headers=h).json()["is_tester"] is True

    moves = client.get(
        f"/api/admin/products/{catalog['coco'].id}/stock-movements", headers=h
    ).json()
    assert {m["is_tester"] for m in moves if m["variant_id"] == tester.id} == {True}


def test_import_reads_testers_from_a_column_or_the_name(client, auth, catalog, db):
    h = auth(UserRole.admin)
    rows = [
        ["Бренд", "Название", "Тип", "Объём", "Тестер", "Цена", "Опт", "Крупный опт"],
        # The same product as in the catalog: the tester is added next to its 100 ml bottle.
        ["Chanel", "Coco Mademoiselle Tester", "EDP", 100, None, 95, 75, 65],
        ["Chanel", "Coco Mademoiselle", "EDP", "50 мл (тестер)", None, 70, None, None],
        ["Dior", "Sauvage", "EDT Tester", 100, None, 80, 65, None],
        ["Creed", "Aventus", "EDP", 50, "да", 150, None, None],
        ["Creed", "Aventus", "EDP", 50, "нет", 180, None, None],
        ["Creed", "Aventus", "EDP", 100, "может быть", 250, None, None],
    ]
    files = {"file": ("c.xlsx", xlsx(rows), "application/octet-stream")}
    report = client.post("/api/admin/import/catalog", files=files, headers=h).json()
    assert [(e["row"], e["error"]) for e in report["errors"]] == [
        (7, "не удалось распознать, тестер ли это: «может быть» (да / нет)")
    ]
    assert report["tester_rows"] == 4
    assert (report["products_created"], report["variants_created"]) == (1, 5)

    def kinds(product_id):
        variants = db.scalars(
            select(ProductVariant)
            .where(ProductVariant.product_id == product_id)
            .execution_options(populate_existing=True)
        )
        return sorted(
            (v.volume_ml, v.is_tester, v.retail_price, v.wholesale_price) for v in variants
        )

    assert kinds(catalog["coco"].id) == [
        (50, False, 100, 80),
        (50, True, 70, None),
        (100, False, 150, 120),
        (100, True, 95, 75),
    ]
    assert kinds(catalog["sauvage"].id) == [(100, False, 90, 75), (100, True, 80, 65)]

    # Importing the same file again changes nothing.
    report = client.post("/api/admin/import/catalog", files=files, headers=h).json()
    assert (report["products_created"], report["variants_created"]) == (0, 0)
    assert report["variants_updated"] == 0
