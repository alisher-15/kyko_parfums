"""variants: the markup on the cost of each price level, remembered from the prices set by hand

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-12 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str | Sequence[str] | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# Nullable columns: yes, older code never reads them.
backward_compatible = True

LEVELS = ("retail", "wholesale", "bulk")


def upgrade() -> None:
    for level in LEVELS:
        op.add_column("product_variants", sa.Column(f"{level}_markup", sa.Numeric(12, 4)))
    # The markups of today's prices, so every volume with a cost has them from the start
    # (the same rule as services/markups.markup_of).
    sets = ", ".join(
        f"{level}_markup = CASE WHEN {level}_price > 0 AND {level}_price / cost_price < 100000 "
        f"THEN round(({level}_price / cost_price - 1) * 100, 4) END"
        for level in LEVELS
    )
    op.execute(f"UPDATE product_variants SET {sets} WHERE cost_price > 0")


def downgrade() -> None:
    for level in LEVELS:
        op.drop_column("product_variants", f"{level}_markup")
