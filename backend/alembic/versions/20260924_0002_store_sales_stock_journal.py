"""store sales (orders.channel, payment, discounts) and stock journal

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-24 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# order_items.list_price is NOT NULL without a default: older code can't create orders.
backward_compatible = False


def _enum(name: str, *values: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True, length=32)


def upgrade() -> None:
    # --- orders: channel, payment, seller; anonymous buyers and optional contacts ---
    op.add_column(
        "orders",
        sa.Column(
            "channel",
            _enum("order_channel", "online", "store"),
            server_default="online",
            nullable=False,
        ),
    )
    op.create_index(op.f("ix_orders_channel"), "orders", ["channel"])
    op.add_column(
        "orders",
        sa.Column(
            "payment_method",
            _enum("payment_method", "cash", "card", "transfer", "other"),
            nullable=True,
        ),
    )
    op.add_column("orders", sa.Column("created_by_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_orders_created_by_id_users",
        "orders",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column("orders", "user_id", existing_type=sa.Integer(), nullable=True)
    for col, type_ in [
        ("contact_name", sa.String(255)),
        ("contact_phone", sa.String(64)),
        ("contact_email", sa.String(255)),
        ("delivery_city", sa.String(128)),
        ("delivery_address", sa.Text()),
    ]:
        op.alter_column("orders", col, existing_type=type_, nullable=True)

    # --- order_items: list price + discount ---
    op.add_column("order_items", sa.Column("list_price", sa.Numeric(12, 2), nullable=True))
    op.execute("UPDATE order_items SET list_price = price_applied")
    op.alter_column("order_items", "list_price", nullable=False)
    op.add_column(
        "order_items",
        sa.Column("discount_percent", sa.Numeric(5, 2), server_default="0", nullable=False),
    )

    # --- pricing settings: store discount limit ---
    op.add_column(
        "pricing_settings",
        sa.Column(
            "max_store_discount_percent", sa.Numeric(5, 2), server_default="10", nullable=False
        ),
    )

    # --- stock journal ---
    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("stock_after", sa.Integer(), nullable=False),
        sa.Column(
            "reason",
            _enum("stock_reason", "online_order", "store_sale", "order_cancel", "manual", "import"),
            nullable=False,
        ),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stock_movements_variant_id"), "stock_movements", ["variant_id"])
    op.create_index(op.f("ix_stock_movements_order_id"), "stock_movements", ["order_id"])
    op.create_index(op.f("ix_stock_movements_created_at"), "stock_movements", ["created_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_stock_movements_created_at"), table_name="stock_movements")
    op.drop_index(op.f("ix_stock_movements_order_id"), table_name="stock_movements")
    op.drop_index(op.f("ix_stock_movements_variant_id"), table_name="stock_movements")
    op.drop_table("stock_movements")
    op.drop_column("pricing_settings", "max_store_discount_percent")
    op.drop_column("order_items", "discount_percent")
    op.drop_column("order_items", "list_price")
    # Store sales have no account/contacts; they can't survive going back to NOT NULL.
    op.execute("DELETE FROM orders WHERE channel = 'store'")
    for col in [
        "delivery_address",
        "delivery_city",
        "contact_email",
        "contact_phone",
        "contact_name",
    ]:
        op.alter_column("orders", col, nullable=False)
    op.alter_column("orders", "user_id", nullable=False)
    op.drop_constraint("fk_orders_created_by_id_users", "orders", type_="foreignkey")
    op.drop_column("orders", "created_by_id")
    op.drop_column("orders", "payment_method")
    op.drop_index(op.f("ix_orders_channel"), table_name="orders")
    op.drop_column("orders", "channel")
