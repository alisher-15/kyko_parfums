"""schema_compat: the oldest code revision that can run on this database

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-27 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# A new table that older code doesn't use.
backward_compatible = True


def upgrade() -> None:
    # One row, filled by alembic/env.py after every run. Never rename: old builds read it.
    op.create_table(
        "schema_compat",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("min_code_revision", sa.String(32), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("schema_compat")
