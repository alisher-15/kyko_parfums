"""promotions: a finished banner, shown whole without the site's text

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-05 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013"
down_revision: str | Sequence[str] | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# A column with a server default: yes, older code gets banners with the site's text as before.
backward_compatible = True


def upgrade() -> None:
    op.add_column(
        "promotions",
        sa.Column("image_only", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("promotions", "image_only")
