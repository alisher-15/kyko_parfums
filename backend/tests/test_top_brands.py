"""The running line of brands on the home page: brands.is_top (app/top_brands.py)."""

import pytest

from app import top_brands
from app.models import UserRole


@pytest.mark.parametrize(
    ("name", "top"),
    [
        ("Creed", True),
        ("Tom Ford", True),
        ("By Kilian", True),
        ("Kilian Paris", True),
        ("Parfums de Marly", True),
        ("Hermès", True),
        ("Maison Francis Kurkdjian", True),
        ("Roja Parfums", True),
        ("Memo Paris", True),
        ("Initio Parfums Privés", True),
        ("Versace", False),
        ("Montale", False),
        ("Tom", False),
        ("", False),
    ],
)
def test_top_house_by_name(name, top):
    assert top_brands.is_top(name) is top


def test_new_brand_is_top_by_name_and_owner_can_change_it(client, auth):
    h = auth(UserRole.admin)
    creed = client.post("/api/admin/brands", json={"name": "Creed"}, headers=h).json()
    zara = client.post("/api/admin/brands", json={"name": "Zara"}, headers=h).json()
    assert creed["is_top"] is True
    assert zara["is_top"] is False
    # The owner decides: a house can be taken out, any brand put in.
    explicit = client.post(
        "/api/admin/brands", json={"name": "Amouage", "is_top": False}, headers=h
    ).json()
    assert explicit["is_top"] is False
    r = client.patch(f"/api/admin/brands/{zara['id']}", json={"is_top": True}, headers=h)
    assert r.json()["is_top"] is True
    # A rename alone leaves the choice as it is.
    r = client.patch(f"/api/admin/brands/{creed['id']}", json={"name": "Creed Paris"}, headers=h)
    assert r.json()["is_top"] is True


def test_imported_brand_and_public_list(client, auth):
    h = auth(UserRole.admin)
    csv = "Бренд;Название;Объём;Цена\nXerjoff;Naxos;100;150000\nLattafa;Asad;100;15000\n"
    r = client.post(
        "/api/admin/import/catalog",
        files={"file": ("c.csv", csv.encode(), "text/csv")},
        headers=h,
    )
    assert r.status_code == 200, r.text
    brands = {b["name"]: b["is_top"] for b in client.get("/api/brands").json()}
    assert brands == {"Xerjoff": True, "Lattafa": False}
