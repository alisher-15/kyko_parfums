"""exchange rate: the dollar rate for prices in USD

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-03 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011"
down_revision: str | Sequence[str] | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# A new table: yes.
backward_compatible = True


def upgrade() -> None:
    op.create_table(
        "exchange_rates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_error", sa.String(255), nullable=True),
        sa.Column("adjustment", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("manual_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("id = 1", name="ck_exchange_rates_singleton"),
        sa.CheckConstraint("adjustment >= -50 AND adjustment <= 50", name="ck_exchange_adjustment"),
        sa.CheckConstraint(
            "manual_rate IS NULL OR manual_rate > 0", name="ck_exchange_manual_rate"
        ),
    )


def downgrade() -> None:
    op.drop_table("exchange_rates")
