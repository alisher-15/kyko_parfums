from decimal import Decimal

from sqlalchemy import select

from app.models import Brand, Product, ProductVariant, UserRole
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


def test_markups_require_admin(client, auth):
    assert client.get("/api/admin/markups").status_code == 401
    assert client.get("/api/admin/markups", headers=auth(UserRole.wholesale)).status_code == 403


def test_base_and_brand_markups(client, auth, catalog):
    h = auth(UserRole.admin)
    r = client.get("/api/admin/markups", headers=h)
    assert r.status_code == 200
    # The markups the catalog was priced with before: cost × 1.6 / 1.3 / 1.2.
    assert r.json()["base"] == {"retail": 60, "wholesale": 30, "bulk": 20}
    chanel = next(b for b in r.json()["brands"] if b["name"] == "Chanel")
    assert chanel == {
        "id": catalog["chanel"].id,
        "name": "Chanel",
        "product_count": 1,
        "retail": 0,
        "wholesale": 0,
        "bulk": 0,
    }

    url = f"/api/admin/markups/brands/{catalog['chanel'].id}"
    r = client.put(url, json={"retail": 10, "wholesale": 30, "bulk": 0}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["wholesale"] == 30
    # 30 + 40 = 70% for wholesale would be above 60 + 0 = 60% for retail.
    r = client.put(url, json={"retail": 0, "wholesale": 40, "bulk": 0}, headers=h)
    assert r.status_code == 422
    assert "выше розничной" in r.json()["detail"]
    r = client.put(url, json={"retail": 0, "wholesale": 0, "bulk": 110}, headers=h)
    assert r.status_code == 422

    # Chanel adds 10 to retail and 30 to wholesale, so its wholesale is 30 + 30 = 60%.
    # Base retail 55 keeps its retail at 65% (fine); base retail 45 makes it 55% (refused).
    r = client.put(
        "/api/admin/markups/base", json={"retail": 55, "wholesale": 30, "bulk": 20}, headers=h
    )
    assert r.status_code == 200, r.text
    r = client.put(
        "/api/admin/markups/base", json={"retail": 45, "wholesale": 30, "bulk": 20}, headers=h
    )
    assert r.status_code == 422
    assert "Chanel" in r.json()["detail"]
    r = client.put(
        "/api/admin/markups/base", json={"retail": 20, "wholesale": 30, "bulk": 10}, headers=h
    )
    assert r.status_code == 422
    assert client.get("/api/admin/markups", headers=h).json()["base"]["retail"] == 55


def test_recalculate_checks_then_applies(client, auth, db):
    h = auth(UserRole.admin)
    lux = Brand(name="Lux", retail_markup=10)
    plain = Brand(name="Plain")
    p = _product(
        db,
        lux,
        _variant("10000"),
        _variant("20000", volume=100, price_locked=True),
        _variant(None, volume=30),
        _variant("0", volume=10),
    )
    priced, locked = p.variants[0].id, p.variants[1].id
    other = _product(db, plain, _variant("5000"))
    # Already at its price: 5000 × 1.6 / 1.3 / 1.2.
    other.variants[0].retail_price = Decimal("8000")
    other.variants[0].wholesale_price = Decimal("6500")
    other.variants[0].bulk_price = Decimal("6000")
    db.commit()

    r = client.post("/api/admin/markups/recalculate", headers=h)
    assert r.status_code == 200, r.text
    report = r.json()
    assert report["dry_run"] is True
    assert {k: report[k] for k in ("changed", "raised", "lowered", "unchanged", "locked")} == {
        "changed": 1,
        "raised": 1,
        "lowered": 0,
        "unchanged": 1,
        "locked": 1,
    }
    assert report["no_cost"] == 2
    [line] = report["lines"]
    assert line["label"] == "Lux Perfume 4, 50 мл"
    assert line["old_retail"] == 1000
    assert line["old_wholesale"] is None
    # Lux: retail 60 + 10 = 70%, wholesale 30%, bulk 20%.
    assert (line["retail"], line["wholesale"], line["bulk"]) == (17000, 13000, 12000)
    db.expire_all()
    assert db.get(ProductVariant, priced).retail_price == Decimal("1000")

    r = client.post("/api/admin/markups/recalculate?dry_run=false", headers=h)
    assert r.json()["changed"] == 1
    db.expire_all()
    v = db.get(ProductVariant, priced)
    assert (v.retail_price, v.wholesale_price, v.bulk_price) == (17000, 13000, 12000)
    assert db.get(ProductVariant, locked).retail_price == Decimal("1000")
    assert client.post("/api/admin/markups/recalculate", headers=h).json()["changed"] == 0


def test_recalculate_one_brand(client, auth, db):
    h = auth(UserRole.admin)
    a, b = Brand(name="A"), Brand(name="B")
    _product(db, a, _variant("10000"))
    _product(db, b, _variant("10000"))

    r = client.post(f"/api/admin/markups/recalculate?dry_run=false&brand_id={a.id}", headers=h)
    assert r.json()["changed"] == 1
    prices = dict(
        db.execute(
            select(Brand.name, ProductVariant.retail_price)
            .join(Product, Product.brand_id == Brand.id)
            .join(ProductVariant)
        ).all()
    )
    assert prices == {"A": Decimal("16000"), "B": Decimal("1000")}
    missing = client.post("/api/admin/markups/recalculate?brand_id=999999", headers=h)
    assert missing.status_code == 404


def test_variant_price_lock(client, auth, catalog):
    h = auth(UserRole.admin)
    url = f"/api/admin/variants/{catalog['coco50'].id}"
    assert client.patch(url, json={"price_locked": True}, headers=h).json()["price_locked"] is True
    # Saving other fields keeps it; null is ignored.
    r = client.patch(url, json={"retail_price": 120, "price_locked": None}, headers=h)
    assert r.json()["price_locked"] is True
    assert (
        client.patch(url, json={"price_locked": False}, headers=h).json()["price_locked"] is False
    )
