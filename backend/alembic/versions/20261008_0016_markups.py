"""markup groups: brands priced at cost plus their group's markups; prices set by hand

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
# A new table, a nullable column and a column with a server default: yes.
backward_compatible = True


def upgrade() -> None:
    groups = op.create_table(
        "price_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("retail_markup", sa.Integer(), nullable=False),
        sa.Column("wholesale_markup", sa.Integer(), nullable=False),
        sa.Column("bulk_markup", sa.Integer(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "retail_markup >= 0 AND wholesale_markup >= 0 AND bulk_markup >= 0",
            name="ck_price_groups_markups",
        ),
    )
    op.create_index(
        "uq_price_groups_default",
        "price_groups",
        ["is_default"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )
    # The markups the catalog was priced with: cost × 1.6 / 1.3 / 1.2.
    op.bulk_insert(
        groups,
        [
            {
                "name": "Базовая",
                "retail_markup": 60,
                "wholesale_markup": 30,
                "bulk_markup": 20,
                "is_default": True,
            }
        ],
    )
    op.add_column(
        "brands",
        sa.Column(
            "price_group_id",
            sa.Integer(),
            sa.ForeignKey("price_groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_brands_price_group_id", "brands", ["price_group_id"])
    op.add_column(
        "product_variants",
        sa.Column("price_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("product_variants", "price_locked")
    op.drop_index("ix_brands_price_group_id", table_name="brands")
    op.drop_column("brands", "price_group_id")
    op.drop_index("uq_price_groups_default", table_name="price_groups")
    op.drop_table("price_groups")
