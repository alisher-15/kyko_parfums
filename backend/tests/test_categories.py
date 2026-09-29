"""The catalog tree: sections («Парфюмерия», «Макияж», …) and their groups."""

from decimal import Decimal
from io import BytesIO

from openpyxl import Workbook
from sqlalchemy import select

from app.models import Brand, Category, Product, ProductVariant, UserRole


def node(tree, path: str) -> Category:
    from app.services import categories

    found = categories.find(tree, path)
    assert found is not None, path
    return found


def add_product(db, brand: str, name: str, category: Category | None, price=1000, **kw):
    b = db.scalar(select(Brand).where(Brand.name == brand)) or Brand(name=brand)
    p = Product(brand=b, name=name, category=category, **kw)
    p.variants = [ProductVariant(volume_ml=50, retail_price=Decimal(price), stock=5)]
    db.add(p)
    db.commit()
    return p


def names(page: dict) -> list[str]:
    return sorted(i["name"] for i in page["items"])


def test_public_tree_counts_products_in_each_section(client, db, tree):
    perfume = node(tree, "Парфюмерия")
    lips = node(tree, "Макияж / Губы")
    add_product(db, "Chanel", "Coco", perfume, type="EDP")
    add_product(db, "MAC", "Ruby Woo", lips)
    add_product(db, "MAC", "Hidden", lips, is_active=False)

    rows = client.get("/api/categories").json()
    by_name = {(r["parent_id"] is None, r["name"]): r for r in rows}
    # Sections come in their order, each followed by its groups.
    sections = [r["name"] for r in rows if r["parent_id"] is None]
    assert sections[:3] == ["Парфюмерия", "Макияж", "Уход за лицом"]
    assert rows[1]["name"] == "Макияж" and rows[2]["parent_id"] == rows[1]["id"]
    assert by_name[(True, "Парфюмерия")]["kind"] == "perfume"
    assert by_name[(True, "Макияж")]["kind"] == "cosmetics"
    # A section counts the active products of its groups; the shop hides empty ones.
    assert by_name[(True, "Макияж")]["product_count"] == 1
    assert by_name[(False, "Губы")]["product_count"] == 1
    assert by_name[(True, "Уход за лицом")]["product_count"] == 0


def test_a_section_shows_the_products_of_all_its_groups(client, db, tree):
    add_product(db, "Chanel", "Coco", node(tree, "Парфюмерия"), type="EDP")
    add_product(db, "MAC", "Ruby Woo", node(tree, "Макияж / Губы"))
    add_product(db, "Maybelline", "Lash", node(tree, "Макияж / Глаза"))

    makeup = node(tree, "Макияж").id
    lips = node(tree, "Макияж / Губы").id
    assert names(client.get("/api/products", params={"category_id": makeup}).json()) == [
        "Lash",
        "Ruby Woo",
    ]
    assert names(client.get("/api/products", params={"category_id": lips}).json()) == ["Ruby Woo"]
    assert len(client.get("/api/products").json()["items"]) == 3

    # Filters only offer what the section has.
    f = client.get("/api/filters", params={"category_id": makeup}).json()
    assert sorted(b["name"] for b in f["brands"]) == ["MAC", "Maybelline"]
    assert f["types"] == []
    assert client.get("/api/filters").json()["types"] == ["EDP"]


def test_products_say_what_they_are_and_where(client, db, tree):
    lips = node(tree, "Макияж / Губы")
    lipstick = add_product(db, "MAC", "Ruby Woo", lips)
    perfume = add_product(
        db, "Chanel", "Coco", node(tree, "Парфюмерия"), type="EDP", olfactory_group="Шипровые"
    )
    unplaced = add_product(db, "Dior", "Sauvage", None, type="EDT")

    d = client.get(f"/api/products/{lipstick.id}").json()
    assert d["kind"] == "cosmetics"
    assert d["category"] == {"id": lips.id, "name": "Губы"}
    assert [c["name"] for c in d["category_path"]] == ["Макияж", "Губы"]

    d = client.get(f"/api/products/{perfume.id}").json()
    assert (d["kind"], d["olfactory_group"]) == ("perfume", "Шипровые")
    assert [c["name"] for c in d["category_path"]] == ["Парфюмерия"]

    # Not placed yet: the perfumes the shop started with.
    d = client.get(f"/api/products/{unplaced.id}").json()
    assert (d["kind"], d["category"], d["category_path"]) == ("perfume", None, [])

    items = {i["name"]: i for i in client.get("/api/products").json()["items"]}
    assert items["Ruby Woo"]["kind"] == "cosmetics"
    assert items["Ruby Woo"]["category"]["name"] == "Губы"


def test_admin_builds_the_tree(client, auth, db, tree):
    h = auth(UserRole.admin)
    makeup = node(tree, "Макияж").id

    # A new section chooses its kind; a group takes its section's.
    rows = client.post(
        "/api/admin/categories", json={"name": "Нишевая парфюмерия", "kind": "perfume"}, headers=h
    ).json()
    niche = next(r for r in rows if r["name"] == "Нишевая парфюмерия")
    assert (niche["parent_id"], niche["kind"]) == (None, "perfume")
    assert rows[-1]["id"] == niche["id"]  # added at the end

    lips = node(tree, "Макияж / Губы").id
    rows = client.post(
        "/api/admin/categories",
        json={"name": "Помада", "parent_id": lips, "kind": "perfume"},
        headers=h,
    ).json()
    lipstick = next(r for r in rows if r["name"] == "Помада")
    assert (lipstick["parent_id"], lipstick["kind"]) == (lips, "cosmetics")

    # Three levels at most: section, group, kind.
    r = client.post(
        "/api/admin/categories", json={"name": "Матовая", "parent_id": lipstick["id"]}, headers=h
    )
    assert r.status_code == 422
    assert "Не больше 3 уровней" in r.json()["detail"]

    # Names are unique among siblings, whatever the case; other sections may reuse them.
    r = client.post("/api/admin/categories", json={"name": "губы", "parent_id": makeup}, headers=h)
    assert r.status_code == 409
    assert r.json()["detail"] == "Такая категория здесь уже есть"
    r = client.post(
        "/api/admin/categories", json={"name": "Губы", "parent_id": niche["id"]}, headers=h
    )
    assert r.status_code == 201

    # Rename.
    rows = client.patch(
        f"/api/admin/categories/{lipstick['id']}", json={"name": "Помады"}, headers=h
    ).json()
    assert any(r["name"] == "Помады" for r in rows)


def test_moving_keeps_the_tree_sound(client, auth, db, tree):
    h = auth(UserRole.admin)
    makeup = node(tree, "Макияж")
    lips = node(tree, "Макияж / Губы")
    face_care = node(tree, "Уход за лицом")
    client.post("/api/admin/categories", json={"name": "Помада", "parent_id": lips.id}, headers=h)

    # A group moved to a perfume section becomes a perfume group, with its subtree.
    perfume = node(tree, "Парфюмерия")
    r = client.patch(f"/api/admin/categories/{lips.id}", json={"parent_id": perfume.id}, headers=h)
    assert r.status_code == 200, r.text
    moved = {x["name"]: x for x in r.json() if x["parent_id"] in (perfume.id, lips.id)}
    assert (moved["Губы"]["kind"], moved["Помада"]["kind"]) == ("perfume", "perfume")

    # Not into itself or its own subtree; not deeper than three levels.
    r = client.patch(f"/api/admin/categories/{makeup.id}", json={"parent_id": makeup.id}, headers=h)
    assert r.status_code == 422
    r = client.patch(f"/api/admin/categories/{perfume.id}", json={"parent_id": lips.id}, headers=h)
    assert r.status_code == 422
    r = client.patch(
        f"/api/admin/categories/{lips.id}",
        json={"parent_id": node(tree, "Уход за лицом / Кремы").id},
        headers=h,
    )
    assert r.status_code == 422
    assert "Не больше 3 уровней" in r.json()["detail"]

    # A group becomes a section; a section's kind goes down to its groups.
    r = client.patch(f"/api/admin/categories/{lips.id}", json={"parent_id": None}, headers=h)
    assert next(x for x in r.json() if x["id"] == lips.id)["parent_id"] is None
    r = client.patch(f"/api/admin/categories/{lips.id}", json={"kind": "cosmetics"}, headers=h)
    assert {x["kind"] for x in r.json() if x["id"] == lips.id or x["parent_id"] == lips.id} == {
        "cosmetics"
    }
    # Only a section has its own kind.
    serums = node(tree, "Уход за лицом / Сыворотки")
    r = client.patch(f"/api/admin/categories/{serums.id}", json={"kind": "perfume"}, headers=h)
    assert r.status_code == 422
    assert face_care.kind.value == "cosmetics"


def test_order_among_siblings(client, auth, db, tree):
    h = auth(UserRole.admin)
    makeup = node(tree, "Макияж")

    def groups(rows):
        return [r["name"] for r in rows if r["parent_id"] == makeup.id]

    lips = node(tree, "Макияж / Губы")
    rows = client.post(f"/api/admin/categories/{lips.id}/move?direction=up", headers=h).json()
    assert groups(rows) == ["Лицо", "Губы", "Глаза", "Брови", "Ногти"]
    face = node(tree, "Макияж / Лицо")
    rows = client.post(f"/api/admin/categories/{face.id}/move?direction=up", headers=h).json()
    assert groups(rows)[0] == "Лицо"  # already first
    rows = client.post(f"/api/admin/categories/{makeup.id}/move?direction=up", headers=h).json()
    assert [r["name"] for r in rows if r["parent_id"] is None][:2] == ["Макияж", "Парфюмерия"]
    # The shop's menu follows.
    public = client.get("/api/categories").json()
    assert [r["name"] for r in public if r["parent_id"] is None][:2] == ["Макияж", "Парфюмерия"]


def test_delete_only_empty_categories(client, auth, db, tree):
    h = auth(UserRole.admin)
    makeup = node(tree, "Макияж")
    lips = node(tree, "Макияж / Губы")
    add_product(db, "MAC", "Ruby Woo", lips)

    r = client.delete(f"/api/admin/categories/{makeup.id}", headers=h)
    assert r.status_code == 409
    assert "подкатегории" in r.json()["detail"]
    r = client.delete(f"/api/admin/categories/{lips.id}", headers=h)
    assert r.status_code == 409
    assert "товары" in r.json()["detail"]
    nails = node(tree, "Макияж / Ногти")
    assert client.delete(f"/api/admin/categories/{nails.id}", headers=h).status_code == 204
    rows = client.get("/api/admin/categories", headers=h).json()
    lips_row = next(r for r in rows if r["id"] == lips.id)
    assert (lips_row["product_count"], lips_row["own_product_count"]) == (1, 1)
    assert next(r for r in rows if r["id"] == makeup.id)["own_product_count"] == 0
    assert all(r["name"] != "Ногти" for r in rows)


def test_admin_places_products(client, auth, db, tree):
    h = auth(UserRole.admin)
    brand = Brand(name="MAC")
    db.add(brand)
    db.commit()
    lips = node(tree, "Макияж / Губы")
    r = client.post(
        "/api/admin/products",
        json={"brand_id": brand.id, "name": "Ruby Woo", "category_id": lips.id},
        headers=h,
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert r.json()["category_id"] == lips.id

    eyes = node(tree, "Макияж / Глаза")
    r = client.patch(f"/api/admin/products/{pid}", json={"category_id": eyes.id}, headers=h)
    assert r.json()["category_id"] == eyes.id
    r = client.patch(f"/api/admin/products/{pid}", json={"category_id": 99999}, headers=h)
    assert r.status_code == 422
    r = client.post(
        "/api/admin/products",
        json={"brand_id": brand.id, "name": "X", "category_id": 99999},
        headers=h,
    )
    assert r.status_code == 422

    # The products list filters by a section with its groups.
    add_product(db, "Chanel", "Coco", node(tree, "Парфюмерия"))
    makeup = node(tree, "Макияж").id
    listed = client.get("/api/admin/products", params={"category_id": makeup}, headers=h).json()
    assert [p["name"] for p in listed["items"]] == ["Ruby Woo"]


def test_admin_only(client, auth, tree):
    for headers in ({}, auth(UserRole.retail), auth(UserRole.wholesale)):
        assert client.get("/api/admin/categories", headers=headers).status_code in (401, 403)
        r = client.post("/api/admin/categories", json={"name": "X"}, headers=headers)
        assert r.status_code in (401, 403)


def xlsx(rows: list[list]) -> bytes:
    wb = Workbook()
    for row in rows:
        wb.active.append(row)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_import_places_products_by_section(client, auth, db, tree):
    h = auth(UserRole.admin)
    content = xlsx(
        [
            ["Бренд", "Название", "Раздел", "Объём", "Цена"],
            ["MAC", "Ruby Woo", "Макияж / Губы", 3, 12000],
            ["Clinique", "Moisture Surge", "Кремы", 50, 24000],  # the only «Кремы» in the tree
            ["Kérastase", "Bain", "Маски", 250, 21000],  # «Маски»: face care and hair care
            ["X", "Y", "Нет такого", 50, 1000],
            ["Chanel", "Coco", "", 50, 72000],  # no section: a perfume
        ]
    )

    def run():
        return client.post(
            "/api/admin/import/catalog",
            files={"file": ("c.xlsx", content, "application/octet-stream")},
            headers=h,
        ).json()

    report = run()
    assert report["products_created"] == 3
    errors = {e["row"]: e["error"] for e in report["errors"]}
    assert set(errors) == {4, 5}
    assert "раздел «Маски» не найден" in errors[4]
    assert "раздел «Нет такого» не найден" in errors[5]
    placed = {p.name: tree.full_name(p.category_id) for p in db.scalars(select(Product))}
    assert placed == {
        "Ruby Woo": "Макияж / Губы",
        "Moisture Surge": "Уход за лицом / Кремы",
        "Coco": "Парфюмерия",
    }

    # Moving a product with the file: the new section wins; an empty cell keeps the old one.
    content = xlsx(
        [
            ["Бренд", "Название", "Раздел"],
            ["MAC", "Ruby Woo", "Макияж / Лицо"],
            ["Clinique", "Moisture Surge", ""],
        ]
    )
    report = run()
    assert report["products_updated"] == 1
    db.expire_all()
    placed = {p.name: tree.full_name(p.category_id) for p in db.scalars(select(Product))}
    assert placed["Ruby Woo"] == "Макияж / Лицо"
    assert placed["Moisture Surge"] == "Уход за лицом / Кремы"
