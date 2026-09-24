"""order edits before delivery, partial returns, order history

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-25 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# order_items.original_quantity is NOT NULL without a default, and new stock reasons:
# older code can't insert order lines or read the new stock journal entries.
backward_compatible = False

OLD_REASONS = ("online_order", "store_sale", "order_cancel", "manual", "import")
NEW_REASONS = (*OLD_REASONS, "order_edit", "return")


def _enum(name: str, *values: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True, length=32)


def _reason_check(values: tuple[str, ...]) -> str:
    return "reason IN (" + ", ".join(f"'{v}'" for v in values) + ")"


def upgrade() -> None:
    # Order lines: keep the quantity at checkout; allow 0 for lines removed by a manager.
    op.add_column("order_items", sa.Column("original_quantity", sa.Integer(), nullable=True))
    op.execute("UPDATE order_items SET original_quantity = quantity")
    op.alter_column("order_items", "original_quantity", nullable=False)
    op.drop_constraint("ck_order_item_quantity", "order_items", type_="check")
    op.create_check_constraint("ck_order_item_quantity", "order_items", "quantity >= 0")

    # New stock journal reasons.
    op.drop_constraint("stock_reason", "stock_movements", type_="check")
    op.create_check_constraint("stock_reason", "stock_movements", _reason_check(NEW_REASONS))

    op.create_table(
        "order_returns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("refund_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "refund_method",
            _enum("refund_method", "cash", "card", "transfer", "other"),
            nullable=True,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_order_returns_order_id"), "order_returns", ["order_id"])

    op.create_table(
        "order_return_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("return_id", sa.Integer(), nullable=False),
        sa.Column("order_item_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("restock", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_return_item_quantity"),
        sa.ForeignKeyConstraint(["return_id"], ["order_returns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_order_return_items_return_id"), "order_return_items", ["return_id"])
    op.create_index(
        op.f("ix_order_return_items_order_item_id"), "order_return_items", ["order_item_id"]
    )

    op.create_table(
        "order_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column(
            "kind",
            _enum("order_event_kind", "created", "status", "edited", "returned"),
            nullable=False,
        ),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_order_events_order_id"), "order_events", ["order_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_order_events_order_id"), table_name="order_events")
    op.drop_table("order_events")
    op.drop_index(op.f("ix_order_return_items_order_item_id"), table_name="order_return_items")
    op.drop_index(op.f("ix_order_return_items_return_id"), table_name="order_return_items")
    op.drop_table("order_return_items")
    op.drop_index(op.f("ix_order_returns_order_id"), table_name="order_returns")
    op.drop_table("order_returns")

    op.execute("DELETE FROM stock_movements WHERE reason IN ('order_edit', 'return')")
    op.drop_constraint("stock_reason", "stock_movements", type_="check")
    op.create_check_constraint("stock_reason", "stock_movements", _reason_check(OLD_REASONS))

    # Lines removed by a manager can't be represented with quantity > 0.
    op.execute("DELETE FROM order_items WHERE quantity = 0")
    op.drop_constraint("ck_order_item_quantity", "order_items", type_="check")
    op.create_check_constraint("ck_order_item_quantity", "order_items", "quantity > 0")
    op.drop_column("order_items", "original_quantity")
