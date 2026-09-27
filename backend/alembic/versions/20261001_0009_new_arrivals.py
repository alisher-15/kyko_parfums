"""new arrivals: an admin marks products as «Новинка» for the home page

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-01 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# A nullable column: yes.
backward_compatible = True


def upgrade() -> None:
    op.add_column("products", sa.Column("new_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_products_new_at", "products", ["new_at"])


def downgrade() -> None:
    op.drop_index("ix_products_new_at", table_name="products")
    op.drop_column("products", "new_at")
