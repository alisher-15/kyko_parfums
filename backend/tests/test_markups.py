from decimal import Decimal

from sqlalchemy import select

from app.models import Brand, PriceGroup, Product, ProductVariant, UserRole
from app.services.markups import price_from_cost


def test_price_from_cost_rounds_up_to_hundreds():
    assert price_from_cost(Decimal("10000"), 30) == Decimal("13000")
    assert price_from_cost(Decimal("12345.67"), 60) == Decimal("19800")
    assert price_from_cost(Decimal("9950"), 0) == Decimal("10000")
    assert price_from_cost(Decimal("10000"), 0) == Decimal("10000")


def _product(db, brand: Brand, *variants: ProductVariant) -> Product:
    p = Product(brand=brand, name=f"Perfume {len(variants)}", type="EDP")
    p.variants = list(variants)
    db.add(p)
    db.commit()
    return p


def _variant(cost: str | None, volume: int = 50, **kw) -> ProductVariant:
    return ProductVariant(
        volume_ml=volume,
        retail_price=Decimal("1000"),
        cost_price=Decimal(cost) if cost else None,
        **kw,
    )


def _prices(db, variant_id: int) -> tuple:
    db.expire_all()
    v = db.get(ProductVariant, variant_id)
    return (v.retail_price, v.wholesale_price, v.bulk_price)


def _group(client, h, name: str, retail: int, wholesale: int, bulk: int) -> dict:
    body = {"name": name, "retail": retail, "wholesale": wholesale, "bulk": bulk}
    r = client.post("/api/admin/markups/groups", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_markups_require_admin(client, auth):
    assert client.get("/api/admin/markups").status_code == 401
    assert client.get("/api/admin/markups", headers=auth(UserRole.wholesale)).status_code == 403


def test_every_brand_starts_in_the_default_group(client, auth, catalog):
    h = auth(UserRole.admin)
    r = client.get("/api/admin/markups", headers=h)
    assert r.status_code == 200, r.text
    [default] = r.json()["groups"]
    # The markups the catalog was priced with before: cost × 1.6 / 1.3 / 1.2.
    assert default | {"id": 0} == {
        "id": 0,
        "name": "Базовая",
        "retail": 60,
        "wholesale": 30,
        "bulk": 20,
        "is_default": True,
        "brand_count": 2,
    }
    assert {b["name"]: b["group_id"] for b in r.json()["brands"]} == {
        "Chanel": default["id"],
        "Dior": default["id"],
    }


def test_groups_are_named_once_and_keep_the_levels_in_order(client, auth):
    h = auth(UserRole.admin)
    _group(client, h, "Люкс", 40, 20, 12)
    body = {"name": " люкс ", "retail": 40, "wholesale": 20, "bulk": 12}
    assert client.post("/api/admin/markups/groups", json=body, headers=h).status_code == 409
    body = {"name": "Ниша", "retail": 40, "wholesale": 50, "bulk": 12}
    r = client.post("/api/admin/markups/groups", json=body, headers=h)
    assert r.status_code == 422
    assert "не может быть выше розничной" in r.text


def test_moving_brands_reprices_them_at_once(client, auth, db):
    h = auth(UserRole.admin)
    a, b = Brand(name="A"), Brand(name="B")
    pa = _product(db, a, _variant("10000"), _variant("20000", volume=100, price_locked=True))
    pb = _product(db, b, _variant("10000"))
    priced, locked, other = pa.variants[0].id, pa.variants[1].id, pb.variants[0].id
    lux = _group(client, h, "Люкс", 40, 20, 12)

    moves = {"brands": [{"brand_id": a.id, "group_id": lux["id"]}]}
    r = client.post("/api/admin/markups/assign", json=moves, headers=h)
    assert r.status_code == 200, r.text
    report = r.json()
    assert report["dry_run"] is True
    assert (report["changed"], report["raised"], report["locked"]) == (1, 1, 1)
    assert (report["lines"][0]["retail"], report["avg_change"]) == (14000, 1300.0)
    # A check changes nothing.
    assert _prices(db, priced) == (Decimal("1000"), None, None)

    r = client.post("/api/admin/markups/assign?dry_run=false", json=moves, headers=h)
    assert r.json()["changed"] == 1
    assert _prices(db, priced) == (14000, 12000, 11200)
    assert _prices(db, locked) == (Decimal("1000"), None, None)
    assert _prices(db, other) == (Decimal("1000"), None, None)
    groups = {g["name"]: g for g in client.get("/api/admin/markups", headers=h).json()["groups"]}
    assert (groups["Люкс"]["brand_count"], groups["Базовая"]["brand_count"]) == (1, 1)

    # Back to the default group: stored as "no group", priced by the default markups.
    default_id = groups["Базовая"]["id"]
    back = {"brands": [{"brand_id": a.id, "group_id": default_id}]}
    r = client.post("/api/admin/markups/assign?dry_run=false", json=back, headers=h)
    assert r.status_code == 200, r.text
    db.expire_all()
    assert db.get(Brand, a.id).price_group_id is None
    assert _prices(db, priced) == (16000, 13000, 12000)

    bad = {"brands": [{"brand_id": a.id, "group_id": 999999}]}
    assert client.post("/api/admin/markups/assign", json=bad, headers=h).status_code == 404


def test_saving_a_group_reprices_its_brands(client, auth, db):
    h = auth(UserRole.admin)
    lux = _group(client, h, "Люкс", 40, 20, 12)
    a = Brand(name="A", price_group_id=lux["id"])
    b = Brand(name="B")
    pa = _product(db, a, _variant("10000"))
    pb = _product(db, b, _variant("10000"))
    priced, other = pa.variants[0].id, pb.variants[0].id
    url = f"/api/admin/markups/groups/{lux['id']}"

    body = {"name": "Люкс", "retail": 50, "wholesale": 25, "bulk": 15}
    r = client.put(url, json=body, headers=h)
    assert r.status_code == 200, r.text
    assert (r.json()["dry_run"], r.json()["changed"]) == (True, 1)
    assert client.get("/api/admin/markups", headers=h).json()["groups"][1]["retail"] == 40

    assert client.put(f"{url}?dry_run=false", json=body, headers=h).json()["changed"] == 1
    assert _prices(db, priced) == (15000, 12500, 11500)
    assert _prices(db, other) == (Decimal("1000"), None, None)

    # Renaming alone changes no price, even when the cost has moved since.
    db.get(ProductVariant, priced).cost_price = Decimal("20000")
    db.commit()
    renamed = body | {"name": "Премиум"}
    r = client.put(f"{url}?dry_run=false", json=renamed, headers=h)
    assert r.json()["changed"] == 0
    assert _prices(db, priced) == (15000, 12500, 11500)
    assert db.scalar(select(PriceGroup.name).where(PriceGroup.id == lux["id"])) == "Премиум"

    # The default group covers the brands without a group.
    default = next(g for g in client.get("/api/admin/markups", headers=h).json()["groups"])
    body = {"name": "Базовая", "retail": 70, "wholesale": 30, "bulk": 20}
    r = client.put(f"/api/admin/markups/groups/{default['id']}?dry_run=false", json=body, headers=h)
    assert r.json()["changed"] == 1
    assert _prices(db, other) == (17000, 13000, 12000)


def test_deleting_groups(client, auth, db):
    h = auth(UserRole.admin)
    default = client.get("/api/admin/markups", headers=h).json()["groups"][0]
    assert client.delete(f"/api/admin/markups/groups/{default['id']}", headers=h).status_code == 409
    lux = _group(client, h, "Люкс", 40, 20, 12)
    db.add(Brand(name="A", price_group_id=lux["id"]))
    db.commit()
    assert client.delete(f"/api/admin/markups/groups/{lux['id']}", headers=h).status_code == 409
    empty = _group(client, h, "Пусто", 40, 20, 12)
    assert client.delete(f"/api/admin/markups/groups/{empty['id']}", headers=h).status_code == 204


def test_recalculate_after_the_cost_changed(client, auth, db):
    h = auth(UserRole.admin)
    lux = _group(client, h, "Люкс", 40, 20, 12)
    p = _product(
        db,
        Brand(name="Lux", price_group_id=lux["id"]),
        _variant("10000"),
        _variant("20000", volume=100, price_locked=True),
        _variant(None, volume=30),
        _variant("0", volume=10),
    )
    priced = p.variants[0].id
    other = _product(db, Brand(name="Plain"), _variant("5000"))
    # Already at its price: 5000 × 1.6 / 1.3 / 1.2.
    other.variants[0].retail_price = Decimal("8000")
    other.variants[0].wholesale_price = Decimal("6500")
    other.variants[0].bulk_price = Decimal("6000")
    db.commit()

    r = client.post("/api/admin/markups/recalculate", headers=h)
    assert r.status_code == 200, r.text
    report = r.json()
    assert report["dry_run"] is True
    assert {k: report[k] for k in ("changed", "unchanged", "locked", "no_cost")} == {
        "changed": 1,
        "unchanged": 1,
        "locked": 1,
        "no_cost": 2,
    }
    [line] = report["lines"]
    assert line["label"] == "Lux Perfume 4, 50 мл"
    assert (line["old_retail"], line["old_wholesale"]) == (1000, None)
    assert (line["retail"], line["wholesale"], line["bulk"]) == (14000, 12000, 11200)
    assert _prices(db, priced) == (Decimal("1000"), None, None)

    url = f"/api/admin/markups/recalculate?dry_run=false&group_id={lux['id']}"
    assert client.post(url, headers=h).json()["changed"] == 1
    assert _prices(db, priced) == (14000, 12000, 11200)
    assert client.post("/api/admin/markups/recalculate", headers=h).json()["changed"] == 0
    missing = client.post("/api/admin/markups/recalculate?group_id=999999", headers=h)
    assert missing.status_code == 404


def test_variant_price_lock(client, auth, catalog):
    h = auth(UserRole.admin)
    url = f"/api/admin/variants/{catalog['coco50'].id}"
    assert client.patch(url, json={"price_locked": True}, headers=h).json()["price_locked"] is True
    # Saving other fields keeps it; null is ignored.
    r = client.patch(url, json={"retail_price": 120, "price_locked": None}, headers=h)
    assert r.json()["price_locked"] is True
    r = client.patch(url, json={"price_locked": False}, headers=h)
    assert r.json()["price_locked"] is False
