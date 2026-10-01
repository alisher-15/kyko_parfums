"""markups: base markup per price level, brand additions, prices set by hand

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-08 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str | Sequence[str] | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# New columns with server defaults: yes, older code never reads them.
backward_compatible = True

LEVELS = ("retail", "wholesale", "bulk")
# The markups the catalog prices were made with: cost × 1.6 / 1.3 / 1.2.
BASE = {"retail": "60", "wholesale": "30", "bulk": "20"}


def upgrade() -> None:
    for level in LEVELS:
        op.add_column(
            "pricing_settings",
            sa.Column(f"{level}_markup", sa.Integer(), nullable=False, server_default=BASE[level]),
        )
        op.add_column(
            "brands",
            sa.Column(f"{level}_markup", sa.Integer(), nullable=False, server_default="0"),
        )
    op.add_column(
        "product_variants",
        sa.Column("price_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("product_variants", "price_locked")
    for level in LEVELS:
        op.drop_column("brands", f"{level}_markup")
        op.drop_column("pricing_settings", f"{level}_markup")
