"""price_changes: every change of a volume's cost or prices, where it came from and who made it

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-19 16:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019"
down_revision: str | Sequence[str] | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# A new table only: yes.
backward_compatible = True


def upgrade() -> None:
    op.create_table(
        "price_changes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "variant_id",
            sa.Integer(),
            sa.ForeignKey("product_variants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "field",
            sa.Enum(
                "cost",
                "retail",
                "wholesale",
                "bulk",
                name="price_field",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("old_value", sa.Numeric(12, 2), nullable=True),
        sa.Column("new_value", sa.Numeric(12, 2), nullable=True),
        sa.Column("source", sa.String(255), nullable=False),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_price_changes_variant_id", "price_changes", ["variant_id", "created_at"])


def downgrade() -> None:
    op.drop_table("price_changes")
