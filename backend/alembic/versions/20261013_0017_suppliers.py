"""suppliers: price lists, the price of each volume at each supplier, and how lines map to volumes

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-13 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0017"
down_revision: str | Sequence[str] | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# New tables only: yes.
backward_compatible = True


def upgrade() -> None:
    suppliers = op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("is_main", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("price_format", sa.String(32), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "price_format IN ('usd_1c', 'barcode_kzt')", name="ck_suppliers_price_format"
        ),
    )
    op.create_index(
        "uq_suppliers_main",
        "suppliers",
        ["is_main"],
        unique=True,
        postgresql_where=sa.text("is_main"),
    )
    op.bulk_insert(
        suppliers,
        [
            {"name": "Канат", "is_main": True, "price_format": "usd_1c"},
            {"name": "Эрик", "is_main": False, "price_format": "barcode_kzt"},
        ],
    )
    op.create_table(
        "supplier_price_lists",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "supplier_id",
            sa.Integer(),
            sa.ForeignKey("suppliers.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("lines", sa.Integer(), nullable=False),
        sa.Column("matched", sa.Integer(), nullable=False),
        sa.Column("unmatched", sa.Integer(), nullable=False),
        sa.Column(
            "uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_table(
        "supplier_prices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "supplier_id",
            sa.Integer(),
            sa.ForeignKey("suppliers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "variant_id",
            sa.Integer(),
            sa.ForeignKey("product_variants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("price_usd", sa.Numeric(12, 2)),
        sa.Column("line", sa.String(512), nullable=False),
        sa.Column(
            "price_list_id",
            sa.Integer(),
            sa.ForeignKey("supplier_price_lists.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("supplier_id", "variant_id", name="uq_supplier_prices_variant"),
        sa.CheckConstraint("price >= 0", name="ck_supplier_prices_price"),
    )
    op.create_table(
        "supplier_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "supplier_id",
            sa.Integer(),
            sa.ForeignKey("suppliers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(512), nullable=False),
        sa.Column("line", sa.String(512), nullable=False),
        sa.Column(
            "variant_id",
            sa.Integer(),
            sa.ForeignKey("product_variants.id", ondelete="CASCADE"),
            index=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("supplier_id", "key", name="uq_supplier_links_key"),
    )


def downgrade() -> None:
    op.drop_table("supplier_links")
    op.drop_table("supplier_prices")
    op.drop_table("supplier_price_lists")
    op.drop_index("uq_suppliers_main", table_name="suppliers")
    op.drop_table("suppliers")
