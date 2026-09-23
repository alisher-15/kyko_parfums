import os

# Tests wipe the database schema, so they never use DATABASE_URL — only TEST_DATABASE_URL.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://kyko:kyko@localhost:5432/kyko_test"
)
os.environ["JWT_SECRET"] = "test-secret-with-enough-length-for-hs256"
os.environ["SMTP_HOST"] = ""

from decimal import Decimal  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Brand, Product, ProductVariant, User, UserRole  # noqa: E402
from app.security import hash_password  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent
PASSWORD = "password123"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    """Build the schema through the real Alembic migrations."""
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clean_db():
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        conn.execute(text("INSERT INTO pricing_settings (id) VALUES (1)"))
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def make_user(db, email: str, role: UserRole = UserRole.retail) -> User:
    user = User(email=email, password_hash=hash_password(PASSWORD), role=role)
    db.add(user)
    db.commit()
    return user


def login(client, email: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def auth(client, db):
    """auth(role) -> headers of a fresh user with that role."""
    counter = {"n": 0}

    def _auth(role: UserRole = UserRole.retail) -> dict[str, str]:
        counter["n"] += 1
        email = f"{role.value}{counter['n']}@example.com"
        make_user(db, email, role)
        return login(client, email)

    return _auth


@pytest.fixture
def catalog(db):
    """Two brands, three products, variants with all three price tiers."""
    chanel = Brand(name="Chanel")
    dior = Brand(name="Dior")
    coco = Product(
        brand=chanel, name="Coco Mademoiselle", type="EDP", category="Шипровые", gender="female"
    )
    coco.variants = [
        ProductVariant(
            volume_ml=50,
            stock=10,
            retail_price=Decimal("100.00"),
            wholesale_price=Decimal("80.00"),
            bulk_price=Decimal("70.00"),
        ),
        ProductVariant(
            volume_ml=100,
            stock=2,
            retail_price=Decimal("150.00"),
            wholesale_price=Decimal("120.00"),
            bulk_price=None,  # falls back to wholesale
        ),
    ]
    sauvage = Product(brand=dior, name="Sauvage", type="EDT", category="Фужерные", gender="male")
    sauvage.variants = [
        ProductVariant(
            volume_ml=100,
            stock=0,
            retail_price=Decimal("90.00"),
            wholesale_price=Decimal("75.00"),
            bulk_price=Decimal("60.00"),
        )
    ]
    no_price = Product(
        brand=dior, name="J'adore", type="EDP", category="Цветочные", gender="female"
    )
    hidden = Product(brand=dior, name="Hidden", type="EDP", is_active=False)
    db.add_all([coco, sauvage, no_price, hidden])
    db.commit()
    return {
        "coco": coco,
        "coco50": coco.variants[0],
        "coco100": coco.variants[1],
        "sauvage": sauvage,
        "sauvage100": sauvage.variants[0],
        "no_price": no_price,
        "hidden": hidden,
        "chanel": chanel,
        "dior": dior,
    }
