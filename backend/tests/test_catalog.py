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
    assert "in_stock" not in item  # stock state is admin data
    assert item["min_price"] == 90


def test_sitemap_lists_products_on_sale_and_their_brands(client, catalog):
    body = client.get("/api/sitemap").json()
    # J'adore has no volume on sale, Hidden is hidden.
    assert [p["id"] for p in body["products"]] == sorted(
        [catalog["coco"].id, catalog["sauvage"].id]
    )
    assert body["brand_ids"] == sorted({catalog["coco"].brand_id, catalog["sauvage"].brand_id})
    assert all(p["updated_at"] for p in body["products"])


def test_filters_and_search(client, catalog):
    assert _names(client.get("/api/products", params={"gender": "male"})) == ["Sauvage"]
    r = client.get("/api/products", params={"brand_id": [catalog["chanel"].id]})
    assert _names(r) == ["Coco Mademoiselle"]
    r = client.get("/api/products", params={"category": ["Шипровые", "Фужерные"], "sort": "name"})
    assert _names(r) == ["Coco Mademoiselle", "Sauvage"]
    assert _names(client.get("/api/products", params={"q": "chanel coco"})) == ["Coco Mademoiselle"]
    assert _names(client.get("/api/products", params={"q": "sauv"})) == ["Sauvage"]
    # LIKE wildcards typed by the user are plain characters.
    assert _names(client.get("/api/products", params={"q": "%"})) == []
    assert _names(client.get("/api/products", params={"q": "sa_vage"})) == []
    assert _names(client.get("/api/products", params={"type": "EDT"})) == ["Sauvage"]


def _search(client, q: str) -> tuple[list[str], bool]:
    body = client.get("/api/products", params={"q": q}).json()
    return [i["name"] for i in body["items"]], body["similar"]


def test_search_by_sound_layout_and_type(client, catalog):
    # Russian spelling, any case: the database compares names by how they sound.
    assert _search(client, "шанель") == (["Coco Mademoiselle"], False)
    assert _search(client, "ШАНЕЛЬ коко") == (["Coco Mademoiselle"], False)
    assert _search(client, "соваж") == (["Sauvage"], False)
    assert _search(client, "диор жадор") == (["J'adore"], False)
    # "sauvage" typed with the Russian layout on.
    assert _search(client, "ыфгмфпу") == (["Sauvage"], False)
    # The type is searched too.
    assert _search(client, "dior edt") == (["Sauvage"], False)


def test_search_falls_back_to_similar_products(client, catalog):
    # No product has these letters: the closest ones are shown, marked as similar.
    assert _search(client, "savage") == (["Sauvage"], True)
    assert _search(client, "madamoiselle") == (["Coco Mademoiselle"], True)
    # Typos that sound the same are found exactly.
    assert _search(client, "mademoisele coko") == (["Coco Mademoiselle"], False)
    # Nothing close: nothing, and not "similar".
    assert _search(client, "абракадабра") == ([], False)
    # Filters still apply to similar products.
    r = client.get("/api/products", params={"q": "savage", "gender": "female"})
    assert r.json()["items"] == []


def test_search_by_other_names(client, catalog, db):
    assert _search(client, "кокошка") == ([], False)
    catalog["coco"].search_names = "кокошка, мадмуазель"
    db.commit()
    assert _search(client, "кокошка") == (["Coco Mademoiselle"], False)


def test_admin_sets_other_names_and_finds_by_sound(client, catalog, auth):
    h = auth(UserRole.admin)
    coco = catalog["coco"].id
    r = client.patch(f"/api/admin/products/{coco}", json={"search_names": "кокошка"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["search_names"] == "кокошка"

    def found(q: str) -> list[str]:
        r = client.get("/api/admin/products", params={"q": q}, headers=h)
        return [p["name"] for p in r.json()["items"]]

    assert found("кокошка") == ["Coco Mademoiselle"]
    assert found("шанель") == ["Coco Mademoiselle"]
    # The admin list has no similar products: it shows exactly what has the words.
    assert found("savage") == []


def test_brand_search_by_sound(client, catalog):
    def names(q: str) -> list[str]:
        return [b["name"] for b in client.get("/api/brands", params={"q": q}).json()]

    assert names("шанель") == ["Chanel"]
    assert names("dio") == ["Dior"]
    assert names("вшщк") == ["Dior"]


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


def test_customers_see_stock_only_when_few_are_left(client, catalog, auth):
    def volumes(product, headers=None):
        r = client.get(f"/api/products/{catalog[product].id}", headers=headers)
        return {v["volume_ml"]: v["stock"] for v in r.json()["variants"]}

    # 10 in stock: nothing; 2 left: "Осталось мало: 2 шт."; 0: nothing (it can be ordered).
    for role in (None, UserRole.retail, UserRole.wholesale, UserRole.bulk_wholesale):
        headers = auth(role) if role else None
        assert volumes("coco", headers) == {50: None, 100: 2}
        assert volumes("sauvage", headers) == {100: None}
    variant = client.get(f"/api/products/{catalog['coco'].id}").json()["variants"][0]
    assert "availability" not in variant
