from decimal import Decimal

from sqlalchemy import select

from app.models import (
    OrderItem,
    ProductVariant,
    StockMovement,
    UserRole,
    VariantBarcode,
)
from app.services.warehouse import average_cost
from tests.conftest import login, make_user
from tests.test_admin import xlsx
from tests.test_orders import CHECKOUT

EAN = "4600000000017"


def journal(db, variant_id):
    return [
        (m.delta, m.stock_after, m.reason.value, m.receipt_id, m.count_id)
        for m in db.query(StockMovement)
        .filter_by(variant_id=variant_id)
        .order_by(StockMovement.id)
        .all()
    ]


def test_warehouse_is_admin_only(client, auth, catalog):
    for headers in ({}, auth(UserRole.wholesale)):
        assert client.get(f"/api/admin/barcodes/{EAN}", headers=headers).status_code in (401, 403)
        assert client.post("/api/admin/receipts", json={}, headers=headers).status_code in (
            401,
            403,
        )
        assert client.post("/api/admin/counts", json={}, headers=headers).status_code in (401, 403)


def test_barcodes(client, auth, catalog, db):
    h = auth(UserRole.admin)
    coco50, coco100 = catalog["coco50"], catalog["coco100"]

    assert client.get(f"/api/admin/barcodes/{EAN}", headers=h).status_code == 404
    r = client.post(
        f"/api/admin/variants/{coco50.id}/barcodes", json={"code": f" {EAN} "}, headers=h
    )
    assert r.status_code == 201, r.text
    assert r.json()["barcodes"] == [EAN]
    # Adding it again is a no-op; giving it to another volume is refused.
    r = client.post(f"/api/admin/variants/{coco50.id}/barcodes", json={"code": EAN}, headers=h)
    assert r.json()["barcodes"] == [EAN]
    r = client.post(f"/api/admin/variants/{coco100.id}/barcodes", json={"code": EAN}, headers=h)
    assert r.status_code == 409
    assert "Coco Mademoiselle, 50 мл" in r.json()["detail"]

    found = client.get(f"/api/admin/barcodes/{EAN}", headers=h).json()
    assert (found["variant_id"], found["volume_ml"], found["stock"]) == (coco50.id, 50, 10)

    # UPC-A read by another scanner as EAN-13 with a leading zero, and vice versa.
    client.post(
        f"/api/admin/variants/{coco100.id}/barcodes", json={"code": "0012345678905"}, headers=h
    )
    assert (
        client.get("/api/admin/barcodes/012345678905", headers=h).json()["variant_id"] == coco100.id
    )

    # Older imports put barcodes into the SKU; they are still found.
    catalog["sauvage100"].sku = "3348901250153"
    db.commit()
    found = client.get("/api/admin/barcodes/3348901250153", headers=h).json()
    assert found["variant_id"] == catalog["sauvage100"].id

    # The product page shows barcodes; the POS search finds by barcode.
    product = client.get(f"/api/admin/products/{catalog['coco'].id}", headers=h).json()
    assert product["variants"][0]["barcodes"] == [EAN]
    hits = client.get("/api/admin/store/variants", params={"q": EAN}, headers=h).json()
    assert hits[0]["variant_id"] == coco50.id

    r = client.delete(f"/api/admin/variants/{coco50.id}/barcodes/{EAN}", headers=h)
    assert r.json()["barcodes"] == []
    assert client.get(f"/api/admin/barcodes/{EAN}", headers=h).status_code == 404


def test_average_cost():
    d = Decimal
    assert average_cost(10, d(50), 10, d(70)) == d(60)
    assert average_cost(1, d(100), 2, d(1)) == d("34.00")
    assert average_cost(5, None, 3, d(70)) == d(70)  # unknown cost of the old units
    assert average_cost(0, d(50), 3, d(70)) == d(70)  # nothing left of the old batch
    assert average_cost(5, d(50), 3, None) == d(50)  # no price on the receipt line


def test_receipt_flow(client, auth, catalog, db):
    h = auth(UserRole.admin)
    coco50, coco100 = catalog["coco50"], catalog["coco100"]
    db.add(VariantBarcode(variant_id=coco50.id, code=EAN))
    coco50.cost_price = Decimal("50")
    db.commit()

    r = client.post(
        "/api/admin/receipts", json={"supplier": " Парфюм-Трейд ", "number": "А-17"}, headers=h
    )
    assert r.status_code == 201
    rid = r.json()["id"]
    assert (r.json()["status"], r.json()["supplier"]) == ("draft", "Парфюм-Трейд")

    # Unknown barcode: 404, the UI then offers to attach it to a volume.
    r = client.post(f"/api/admin/receipts/{rid}/scan", json={"code": "999"}, headers=h)
    assert (r.status_code, r.json()["detail"]) == (404, "Штрихкод 999 не найден")

    # Each scan adds one; the line starts with the current average cost.
    client.post(f"/api/admin/receipts/{rid}/scan", json={"code": EAN}, headers=h)
    r = client.post(f"/api/admin/receipts/{rid}/scan", json={"code": EAN}, headers=h).json()
    line = r["items"][0]
    assert (line["quantity"], line["cost_price"], line["stock"], line["current_cost"]) == (
        2,
        50,
        10,
        50,
    )
    assert r["touched_line_id"] == line["id"]

    # Volumes without a barcode are added from the search, with a price.
    r = client.post(
        f"/api/admin/receipts/{rid}/lines",
        json={"variant_id": coco100.id, "quantity": 3, "cost_price": 90},
        headers=h,
    ).json()
    assert [(i["label"], i["quantity"]) for i in r["items"]] == [
        ("Chanel Coco Mademoiselle, 50 мл", 2),
        ("Chanel Coco Mademoiselle, 100 мл", 3),
    ]
    r = client.patch(
        f"/api/admin/receipts/{rid}/lines/{line['id']}",
        json={"quantity": 10, "cost_price": 70},
        headers=h,
    ).json()
    assert (r["total_quantity"], r["total_cost"]) == (13, 10 * 70 + 3 * 90)

    # Nothing moved yet.
    db.expire_all()
    assert (db.get(ProductVariant, coco50.id).stock, db.get(ProductVariant, coco100.id).stock) == (
        10,
        2,
    )

    r = client.post(f"/api/admin/receipts/{rid}/post", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "posted" and r.json()["posted_at"]

    db.expire_all()
    v50, v100 = db.get(ProductVariant, coco50.id), db.get(ProductVariant, coco100.id)
    assert (v50.stock, v50.cost_price) == (20, Decimal("60.00"))  # (10×50 + 10×70) / 20
    assert (v100.stock, v100.cost_price) == (5, Decimal("90.00"))  # unknown before
    assert journal(db, coco50.id)[-1] == (10, 20, "receipt", rid, None)
    note = db.query(StockMovement).filter_by(receipt_id=rid).first().note
    assert note == f"Приёмка №{rid} · Парфюм-Трейд · накл. А-17"

    # Posted receipts are read-only.
    for call in (
        lambda: client.post(f"/api/admin/receipts/{rid}/scan", json={"code": EAN}, headers=h),
        lambda: client.post(f"/api/admin/receipts/{rid}/post", headers=h),
        lambda: client.delete(f"/api/admin/receipts/{rid}", headers=h),
    ):
        assert call().status_code == 409

    # The next receipt suggests the last purchase price and the supplier.
    rid2 = client.post("/api/admin/receipts", json={}, headers=h).json()["id"]
    r = client.post(f"/api/admin/receipts/{rid2}/scan", json={"code": EAN}, headers=h).json()
    assert r["items"][0]["cost_price"] == 70
    assert client.get("/api/admin/receipts/suppliers", headers=h).json() == ["Парфюм-Трейд"]
    listed = client.get("/api/admin/receipts", headers=h).json()
    assert [(x["id"], x["status"], x["lines"]) for x in listed] == [
        (rid2, "draft", 1),
        (rid, "posted", 2),
    ]

    # Drafts can be emptied and deleted; an empty receipt can't be posted.
    r = client.delete(f"/api/admin/receipts/{rid2}/lines/{r['items'][0]['id']}", headers=h)
    assert r.json()["items"] == []
    assert client.post(f"/api/admin/receipts/{rid2}/post", headers=h).status_code == 422
    assert client.delete(f"/api/admin/receipts/{rid2}", headers=h).status_code == 204


def test_stock_count(client, auth, catalog, db):
    h = auth(UserRole.admin)
    coco50, coco100 = catalog["coco50"], catalog["coco100"]
    db.add(VariantBarcode(variant_id=coco50.id, code=EAN))
    db.commit()

    cid = client.post("/api/admin/counts", json={"note": "Витрина"}, headers=h).json()["id"]
    for _ in range(3):
        r = client.post(f"/api/admin/counts/{cid}/scan", json={"code": EAN}, headers=h)
    r = client.post(f"/api/admin/counts/{cid}/scan", json={"code": EAN, "quantity": 5}, headers=h)
    # 100 ml was not found on the shelf at all.
    r = client.post(
        f"/api/admin/counts/{cid}/lines", json={"variant_id": coco100.id, "quantity": 0}, headers=h
    ).json()
    assert [(i["counted"], i["expected"]) for i in r["items"]] == [(8, 10), (0, 2)]
    assert r["difference"] == -4

    line_id = r["items"][0]["id"]
    r = client.patch(
        f"/api/admin/counts/{cid}/lines/{line_id}", json={"counted": 9}, headers=h
    ).json()
    assert r["difference"] == -3

    # A sale between counting and posting: the count still wins, "expected" is taken at posting.
    coco50.stock = 11
    db.commit()

    r = client.post(f"/api/admin/counts/{cid}/post", headers=h).json()
    assert r["status"] == "posted"
    assert [(i["counted"], i["expected"]) for i in r["items"]] == [(9, 11), (0, 2)]
    db.expire_all()
    assert db.get(ProductVariant, coco50.id).stock == 9
    assert db.get(ProductVariant, coco100.id).stock == 0
    assert journal(db, coco50.id)[-1] == (-2, 9, "inventory", None, cid)
    assert journal(db, coco100.id)[-1] == (-2, 0, "inventory", None, cid)

    assert (
        client.post(f"/api/admin/counts/{cid}/scan", json={"code": EAN}, headers=h).status_code
        == 409
    )
    listed = client.get("/api/admin/counts", headers=h).json()
    assert [(c["id"], c["status"], c["difference"]) for c in listed] == [(cid, "posted", -4)]

    # The stock history of the product links to the documents.
    moves = client.get(
        f"/api/admin/products/{catalog['coco'].id}/stock-movements", headers=h
    ).json()
    assert {(m["reason"], m["count_id"]) for m in moves} == {("inventory", cid)}


def test_sales_remember_cost_and_stats_show_margin(client, auth, catalog, db):
    h = auth(UserRole.admin)
    coco50 = catalog["coco50"]
    coco50.cost_price = Decimal("60")
    db.commit()

    # Store sale: 2 × 95 (5% off 100).
    sale = client.post(
        "/api/admin/store/sales",
        json={
            "items": [
                {"variant_id": coco50.id, "quantity": 2, "discount_percent": 5},
                {"variant_id": catalog["coco100"].id, "quantity": 1},  # cost unknown
            ],
            "payment_method": "cash",
        },
        headers=h,
    ).json()
    costs = {i.volume_ml: i.cost_price for i in db.query(OrderItem).filter_by(order_id=sale["id"])}
    assert costs == {50: Decimal("60.00"), 100: None}
    # Online order: 1 × 100 at retail; one unit comes back later.
    make_user(db, "anna@example.com")
    buyer = login(client, "anna@example.com")
    order = client.post(
        "/api/orders",
        json={**CHECKOUT, "items": [{"variant_id": coco50.id, "quantity": 1}]},
        headers=buyer,
    ).json()
    for st in ("processing", "shipped", "delivered"):
        client.patch(f"/api/admin/orders/{order['id']}", json={"status": st}, headers=h)
    r = client.post(
        f"/api/admin/orders/{order['id']}/returns",
        json={"items": [{"order_item_id": order["items"][0]["id"], "quantity": 1}]},
        headers=h,
    )
    assert r.status_code == 201, r.text

    stats = client.get("/api/admin/stats", headers=h).json()
    # Only the store sale's 50 ml counts: (95 - 60) × 2; the returned unit and the line without
    # a cost don't.
    assert (stats["gross_profit"], stats["costed_revenue"]) == (70, 190)
    db.expire_all()
    left = db.get(ProductVariant, coco50.id).stock
    assert stats["stock_value"] == left * 60
    assert stats["variants_without_cost"] == 1  # 100 ml has stock but no cost


def test_import_barcodes_and_cost(client, auth, catalog, db):
    h = auth(UserRole.admin)
    db.add(VariantBarcode(variant_id=catalog["coco50"].id, code="111"))
    db.commit()
    rows = [
        ["Бренд", "Название", "Тип", "Объём", "Цена", "Штрихкод", "Себестоимость"],
        ["Tom Ford", "Oud Wood", "EDP", 50, 100, 4600000000024, 55],
        ["Tom Ford", "Oud Wood", "EDP", 100, 180, "4600000000031; 4600000000048", None],
        ["Tom Ford", "Lost Cherry", "EDP", 50, 120, "111", "70,5"],
    ]
    files = {"file": ("c.xlsx", xlsx(rows), "application/octet-stream")}
    report = client.post("/api/admin/import/catalog", files=files, headers=h).json()
    assert [e["error"] for e in report["errors"]] == [
        "штрихкод 111 уже у другого товара — не сохранён"
    ]
    assert report["variants_created"] == 3

    def by_code(code):
        return client.get(f"/api/admin/barcodes/{code}", headers=h).json()

    oud50 = by_code("4600000000024")
    assert (oud50["volume_ml"], oud50["cost_price"]) == (50, 55)
    assert by_code("4600000000031")["variant_id"] == by_code("4600000000048")["variant_id"]
    assert by_code("111")["variant_id"] == catalog["coco50"].id
    cherry = client.get("/api/admin/store/variants", params={"q": "Lost Cherry"}, headers=h).json()
    assert cherry[0]["cost_price"] == 70.5

    # The template has the new columns.
    template = client.get("/api/admin/import/template", headers=h)
    assert template.status_code == 200


def test_count_keeps_units_promised_to_open_orders(client, auth, catalog, db):
    """Goods set aside for orders that are not shipped are counted but not for sale."""
    admin, buyer = auth(UserRole.admin), auth()
    coco50, coco100 = catalog["coco50"], catalog["coco100"]

    def order(variant, quantity):
        item = {"variant_id": variant.id, "quantity": quantity}
        return client.post("/api/orders", json={**CHECKOUT, "items": [item]}, headers=buyer).json()

    order(coco50, 2)  # 10 → 8, both units still on the shelf
    order(coco100, 3)  # 2 → -1: two on the shelf, one owed
    shipped = order(coco50, 1)  # 8 → 7, gone once shipped
    client.patch(f"/api/admin/orders/{shipped['id']}", json={"status": "shipped"}, headers=admin)

    cid = client.post("/api/admin/counts", json={}, headers=admin).json()["id"]
    # One 50 ml bottle is missing from the shelf; the 100 ml count matches.
    for variant, counted in ((coco50, 8), (coco100, 2)):
        r = client.post(
            f"/api/admin/counts/{cid}/lines",
            json={"variant_id": variant.id, "quantity": counted},
            headers=admin,
        ).json()
    # Expected on the shelf = free stock + units in open orders.
    assert [(i["counted"], i["expected"], i["reserved"]) for i in r["items"]] == [
        (8, 9, 2),
        (2, 2, 3),
    ]
    r = client.post(f"/api/admin/counts/{cid}/post", headers=admin).json()
    assert [(i["expected"], i["reserved"]) for i in r["items"]] == [(9, None), (2, None)]
    db.expire_all()
    assert db.get(ProductVariant, coco50.id).stock == 6  # 8 on the shelf - 2 promised
    assert db.get(ProductVariant, coco100.id).stock == -1  # 2 on the shelf - 3 promised
    last = db.scalars(
        select(StockMovement)
        .where(StockMovement.variant_id == coco50.id)
        .order_by(StockMovement.id.desc())
    ).first()
    assert (last.delta, last.note) == (-1, f"Инвентаризация №{cid} · в заказах 2 шт.")


def test_backorders_are_filled_by_receipts_and_block_the_till(client, auth, catalog, db):
    admin = auth(UserRole.admin)
    coco100 = catalog["coco100"]
    item = {"variant_id": coco100.id, "quantity": 5}  # 2 in stock → -3
    client.post("/api/orders", json={**CHECKOUT, "items": [item]}, headers=auth())

    stats = client.get("/api/admin/stats", headers=admin).json()
    assert (stats["variants_backordered"], stats["units_backordered"]) == (1, 3)
    listed = client.get("/api/admin/products", params={"backordered": True}, headers=admin).json()
    assert [p["name"] for p in listed["items"]] == ["Coco Mademoiselle"]

    # The till sells only what is on the shelf and free.
    r = client.post(
        "/api/admin/store/sales",
        json={"items": [{"variant_id": coco100.id, "quantity": 1}]},
        headers=admin,
    )
    assert r.status_code == 409
    assert "на складе только 0 шт." in r.json()["detail"]["message"]

    # A receipt covers what is owed first.
    rid = client.post("/api/admin/receipts", json={}, headers=admin).json()["id"]
    client.post(
        f"/api/admin/receipts/{rid}/lines",
        json={"variant_id": coco100.id, "quantity": 4, "cost_price": 50},
        headers=admin,
    )
    client.post(f"/api/admin/receipts/{rid}/post", headers=admin)
    db.expire_all()
    variant = db.get(ProductVariant, coco100.id)
    assert (variant.stock, variant.cost_price) == (1, Decimal("50.00"))
    stats = client.get("/api/admin/stats", headers=admin).json()
    assert stats["variants_backordered"] == 0
