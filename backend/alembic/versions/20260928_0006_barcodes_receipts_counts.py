"""barcodes, purchase cost, stock receipts and stock counts

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-28 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# New tables, nullable columns and a looser stock_reason check.
backward_compatible = True

OLD_REASONS = (
    "online_order",
    "store_sale",
    "order_cancel",
    "manual",
    "import",
    "order_edit",
    "return",
)
NEW_REASONS = (*OLD_REASONS, "receipt", "inventory")


def _enum(name: str, *values: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True, length=32)


def _reason_check(values: tuple[str, ...]) -> str:
    return "reason IN (" + ", ".join(f"'{v}'" for v in values) + ")"


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def _updated_at() -> sa.Column:
    return sa.Column(
        "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "variant_barcodes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        _created_at(),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_variant_barcodes_variant_id"), "variant_barcodes", ["variant_id"])

    op.add_column("product_variants", sa.Column("cost_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("order_items", sa.Column("cost_price", sa.Numeric(12, 2), nullable=True))

    op.create_table(
        "stock_receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            _enum("receipt_status", "draft", "posted"),
            server_default="draft",
            nullable=False,
        ),
        sa.Column("supplier", sa.String(255), nullable=True),
        sa.Column("number", sa.String(64), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("posted_by_id", sa.Integer(), nullable=True),
        _created_at(),
        _updated_at(),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["posted_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stock_receipts_status"), "stock_receipts", ["status"])

    op.create_table(
        "stock_receipt_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receipt_id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=True),
        sa.Column("label", sa.String(512), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("cost_price", sa.Numeric(12, 2), nullable=True),
        sa.CheckConstraint("quantity > 0", name="ck_receipt_item_quantity"),
        sa.CheckConstraint("cost_price IS NULL OR cost_price >= 0", name="ck_receipt_item_cost"),
        sa.ForeignKeyConstraint(["receipt_id"], ["stock_receipts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("receipt_id", "variant_id", name="uq_receipt_item_variant"),
    )
    op.create_index(
        op.f("ix_stock_receipt_items_receipt_id"), "stock_receipt_items", ["receipt_id"]
    )
    op.create_index(
        op.f("ix_stock_receipt_items_variant_id"), "stock_receipt_items", ["variant_id"]
    )

    op.create_table(
        "stock_counts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            _enum("count_status", "draft", "posted"),
            server_default="draft",
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("posted_by_id", sa.Integer(), nullable=True),
        _created_at(),
        _updated_at(),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["posted_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stock_counts_status"), "stock_counts", ["status"])

    op.create_table(
        "stock_count_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("count_id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=True),
        sa.Column("label", sa.String(512), nullable=False),
        sa.Column("counted", sa.Integer(), nullable=False),
        sa.Column("expected", sa.Integer(), nullable=True),
        sa.CheckConstraint("counted >= 0", name="ck_count_item_counted"),
        sa.ForeignKeyConstraint(["count_id"], ["stock_counts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("count_id", "variant_id", name="uq_count_item_variant"),
    )
    op.create_index(op.f("ix_stock_count_items_count_id"), "stock_count_items", ["count_id"])
    op.create_index(op.f("ix_stock_count_items_variant_id"), "stock_count_items", ["variant_id"])

    # Stock journal: link to the document, new reasons.
    op.add_column("stock_movements", sa.Column("receipt_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("count_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_stock_movements_receipt_id",
        "stock_movements",
        "stock_receipts",
        ["receipt_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_stock_movements_count_id",
        "stock_movements",
        "stock_counts",
        ["count_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_stock_movements_receipt_id"), "stock_movements", ["receipt_id"])
    op.create_index(op.f("ix_stock_movements_count_id"), "stock_movements", ["count_id"])
    op.drop_constraint("stock_reason", "stock_movements", type_="check")
    op.create_check_constraint("stock_reason", "stock_movements", _reason_check(NEW_REASONS))


def downgrade() -> None:
    op.execute("DELETE FROM stock_movements WHERE reason IN ('receipt', 'inventory')")
    op.drop_constraint("stock_reason", "stock_movements", type_="check")
    op.create_check_constraint("stock_reason", "stock_movements", _reason_check(OLD_REASONS))
    op.drop_index(op.f("ix_stock_movements_count_id"), table_name="stock_movements")
    op.drop_index(op.f("ix_stock_movements_receipt_id"), table_name="stock_movements")
    op.drop_constraint("fk_stock_movements_count_id", "stock_movements", type_="foreignkey")
    op.drop_constraint("fk_stock_movements_receipt_id", "stock_movements", type_="foreignkey")
    op.drop_column("stock_movements", "count_id")
    op.drop_column("stock_movements", "receipt_id")

    op.drop_table("stock_count_items")
    op.drop_table("stock_counts")
    op.drop_table("stock_receipt_items")
    op.drop_table("stock_receipts")
    op.drop_column("order_items", "cost_price")
    op.drop_column("product_variants", "cost_price")
    op.drop_table("variant_barcodes")
