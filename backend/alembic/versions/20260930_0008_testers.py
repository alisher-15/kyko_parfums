"""testers: a volume can be sold as a tester, next to the regular bottle of the same size

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-30 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# Columns with a server default and a looser unique constraint: yes.
backward_compatible = True


def upgrade() -> None:
    op.add_column(
        "product_variants",
        sa.Column("is_tester", sa.Boolean(), nullable=False, server_default="false"),
    )
    # 100 ml and a 100 ml tester are two variants of one product.
    op.drop_constraint("uq_variant_product_volume", "product_variants", type_="unique")
    op.create_unique_constraint(
        "uq_variant_product_volume_tester",
        "product_variants",
        ["product_id", "volume_ml", "is_tester"],
    )
    # Snapshot: the order keeps saying "тестер" if the variant changes later.
    op.add_column(
        "order_items",
        sa.Column("is_tester", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("order_items", "is_tester")
    op.drop_constraint("uq_variant_product_volume_tester", "product_variants", type_="unique")
    # The older schema has no place for testers. Orders keep their snapshots (variant_id is
    # set to NULL), like after deleting a product.
    op.execute("DELETE FROM product_variants WHERE is_tester")
    op.create_unique_constraint(
        "uq_variant_product_volume", "product_variants", ["product_id", "volume_ml"]
    )
    op.drop_column("product_variants", "is_tester")
