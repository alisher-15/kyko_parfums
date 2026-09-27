"""promotions: home page banners and discounts off the retail price

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-02 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010"
down_revision: str | Sequence[str] | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# New tables and nullable columns: yes.
backward_compatible = True


def upgrade() -> None:
    op.create_table(
        "promotions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("image_url", sa.String(1024), nullable=True),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("starts_on", sa.Date(), nullable=True),
        sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("all_products", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "discount_percent IS NULL OR (discount_percent > 0 AND discount_percent < 100)",
            name="ck_promotion_discount",
        ),
        sa.CheckConstraint(
            "starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on",
            name="ck_promotion_dates",
        ),
    )
    op.create_table(
        "promotion_brands",
        sa.Column(
            "promotion_id",
            sa.Integer(),
            sa.ForeignKey("promotions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "brand_id",
            sa.Integer(),
            sa.ForeignKey("brands.id", ondelete="CASCADE"),
            primary_key=True,
            index=True,
        ),
    )
    op.create_table(
        "promotion_products",
        sa.Column(
            "promotion_id",
            sa.Integer(),
            sa.ForeignKey("promotions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            primary_key=True,
            index=True,
        ),
    )
    op.add_column("order_items", sa.Column("promotion_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "order_items_promotion_id_fkey",
        "order_items",
        "promotions",
        ["promotion_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_order_items_promotion_id", "order_items", ["promotion_id"])
    op.add_column("order_items", sa.Column("promotion_title", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("order_items", "promotion_title")
    op.drop_index("ix_order_items_promotion_id", table_name="order_items")
    op.drop_constraint("order_items_promotion_id_fkey", "order_items", type_="foreignkey")
    op.drop_column("order_items", "promotion_id")
    op.drop_table("promotion_products")
    op.drop_table("promotion_brands")
    op.drop_table("promotions")
