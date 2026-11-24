"""orders.request_key: a retried checkout or till sale returns the order it already placed

Revision ID: 0024
Revises: 0023
Create Date: 2026-11-24 21:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0024"
down_revision: str | Sequence[str] | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# A nullable column: yes.
backward_compatible = True


def upgrade() -> None:
    op.add_column("orders", sa.Column("request_key", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_orders_request_key", "orders", ["request_key"])


def downgrade() -> None:
    op.drop_constraint("uq_orders_request_key", "orders", type_="unique")
    op.drop_column("orders", "request_key")
