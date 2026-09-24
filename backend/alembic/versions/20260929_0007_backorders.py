"""backorders: stock may go below zero, order lines remember what was missing

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-29 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# A dropped check (looser) and a column with a server default: yes.
backward_compatible = True


def upgrade() -> None:
    # Negative stock = units customers ordered that are not in the shop yet.
    op.drop_constraint("ck_variant_stock_non_negative", "product_variants", type_="check")
    op.add_column(
        "order_items",
        sa.Column("backordered", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_check_constraint("ck_order_item_backordered", "order_items", "backordered >= 0")


def downgrade() -> None:
    op.drop_constraint("ck_order_item_backordered", "order_items", type_="check")
    op.drop_column("order_items", "backordered")
    op.execute("UPDATE product_variants SET stock = 0 WHERE stock < 0")
    op.create_check_constraint("ck_variant_stock_non_negative", "product_variants", "stock >= 0")
