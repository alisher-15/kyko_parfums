from app.models import UserRole


def _names(resp) -> list[str]:
    return [p["name"] for p in resp.json()["items"]]


def test_guest_sees_only_retail_prices(client, catalog):
    r = client.get(f"/api/products/{catalog['coco'].id}")
    assert r.status_code == 200
    v50 = next(v for v in r.json()["variants"] if v["volume_ml"] == 50)
    assert v50["price"] == 100
    assert v50["price_tier"] == "retail"
    assert v50["wholesale_price"] is None
    assert v50["bulk_price"] is None


def test_wholesale_and_bulk_prices_by_role(client, catalog, auth):
    r = client.get(f"/api/products/{catalog['coco'].id}", headers=auth(UserRole.wholesale))
    v = {v["volume_ml"]: v for v in r.json()["variants"]}
    assert v[50]["price"] == 80
    assert v[50]["wholesale_price"] == 80
    assert v[50]["bulk_price"] is None  # hidden from wholesale role

    r = client.get(f"/api/products/{catalog['coco'].id}", headers=auth(UserRole.bulk_wholesale))
    v = {v["volume_ml"]: v for v in r.json()["variants"]}
    assert v[50]["price"] == 70
    assert v[100]["price"] == 120  # no bulk price -> wholesale fallback
    assert r.json()["min_price"] == 70


def test_list_hides_inactive_and_orders_priced_first(client, catalog):
    r = client.get("/api/products")
    assert r.status_code == 200
    names = _names(r)
    assert "Hidden" not in names
    assert r.json()["total"] == 3
    assert names[-1] == "J'adore"  # no variants -> last
    assert client.get(f"/api/products/{catalog['hidden'].id}").status_code == 404


def test_list_item_shape(client, catalog):
    item = next(p for p in client.get("/api/products").json()["items"] if p["name"] == "Sauvage")
    assert item["brand"]["name"] == "Dior"
    assert item["volumes"] == [100]
    assert item["in_stock"] is False
    assert item["min_price"] == 90


def test_filters_and_search(client, catalog):
    assert _names(client.get("/api/products", params={"gender": "male"})) == ["Sauvage"]
    r = client.get("/api/products", params={"brand_id": [catalog["chanel"].id]})
    assert _names(r) == ["Coco Mademoiselle"]
    r = client.get("/api/products", params={"category": ["Шипровые", "Фужерные"], "sort": "name"})
    assert _names(r) == ["Coco Mademoiselle", "Sauvage"]
    assert _names(client.get("/api/products", params={"q": "chanel coco"})) == ["Coco Mademoiselle"]
    assert _names(client.get("/api/products", params={"q": "sauv"})) == ["Sauvage"]
    assert _names(client.get("/api/products", params={"in_stock": True})) == ["Coco Mademoiselle"]
    assert _names(client.get("/api/products", params={"type": "EDT"})) == ["Sauvage"]


def test_price_filter_uses_role_price(client, catalog, auth):
    # Retail: coco 100/150, sauvage 90.
    r = client.get("/api/products", params={"max_price": 95})
    assert _names(r) == ["Sauvage"]
    # Bulk: coco 70/120, sauvage 60.
    r = client.get("/api/products", params={"max_price": 75}, headers=auth(UserRole.bulk_wholesale))
    assert sorted(_names(r)) == ["Coco Mademoiselle", "Sauvage"]


def test_sorting_and_pagination(client, catalog):
    r = client.get("/api/products", params={"sort": "price_asc", "page_size": 2})
    assert _names(r) == ["Sauvage", "Coco Mademoiselle"]
    assert r.json()["total"] == 3
    r = client.get("/api/products", params={"sort": "price_asc", "page_size": 2, "page": 2})
    assert _names(r) == ["J'adore"]
    r = client.get("/api/products", params={"sort": "price_desc"})
    assert _names(r)[0] == "Coco Mademoiselle"


def test_filters_endpoint(client, catalog, auth):
    body = client.get("/api/filters").json()
    assert [b["name"] for b in body["brands"]] == ["Chanel", "Dior"]
    assert body["genders"] == ["female", "male"]
    assert body["categories"] == ["Фужерные", "Цветочные", "Шипровые"]
    assert body["types"] == ["EDP", "EDT"]
    assert (body["price_min"], body["price_max"]) == (90, 150)

    body = client.get("/api/filters", headers=auth(UserRole.bulk_wholesale)).json()
    assert (body["price_min"], body["price_max"]) == (60, 120)


def test_brands(client, catalog):
    brands = client.get("/api/brands").json()
    assert [(b["name"], b["product_count"]) for b in brands] == [("Chanel", 1), ("Dior", 2)]


def test_pricing_rules_visibility(client, catalog, auth):
    r = client.get("/api/pricing/rules").json()
    assert r["max_tier"] == "retail"
    assert r["wholesale_min_order_amount"] is None

    r = client.get("/api/pricing/rules", headers=auth(UserRole.wholesale)).json()
    assert r["max_tier"] == "wholesale"
    assert r["wholesale_min_order_amount"] == 0
    assert r["bulk_min_order_amount"] is None
