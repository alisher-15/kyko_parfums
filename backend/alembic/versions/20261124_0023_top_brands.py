"""brands.is_top: the houses in the running line of brands on the home page

Revision ID: 0023
Revises: 0022
Create Date: 2026-11-24 12:00:00

"""

import re
import unicodedata
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0023"
down_revision: str | Sequence[str] | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# A column with a server default: yes.
backward_compatible = True

# A copy of app/top_brands.py as it was: a migration must not change when the app does.
TOP_BRANDS = {
    "amouage",
    "boadicea victorious",
    "bulgari",
    "bvlgari",
    "byredo",
    "chanel",
    "christian dior",
    "clive christian",
    "creed",
    "dior",
    "ex nihilo",
    "frederic malle",
    "guerlain",
    "hermes",
    "initio",
    "kilian",
    "le labo",
    "louis vuitton",
    "maison crivelli",
    "maison francis kurkdjian",
    "marly",
    "memo",
    "mfk",
    "nishane",
    "roja",
    "roja dove",
    "tiziana terenzi",
    "tom ford",
    "xerjoff",
}
NOISE = {"by", "parfums", "parfum", "perfumes", "paris", "prives", "editions", "de", "the"}


def _key(name: str) -> str:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return " ".join(w for w in re.sub(r"[^a-z0-9]+", " ", plain).split() if w not in NOISE)


def upgrade() -> None:
    op.add_column(
        "brands",
        sa.Column("is_top", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    bind = op.get_bind()
    ids = [
        row.id
        for row in bind.execute(sa.text("SELECT id, name FROM brands"))
        if _key(row.name) in TOP_BRANDS
    ]
    if ids:
        bind.execute(sa.text("UPDATE brands SET is_top = true WHERE id = ANY(:ids)"), {"ids": ids})


def downgrade() -> None:
    op.drop_column("brands", "is_top")
