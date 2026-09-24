"""upgrade requests to any higher role; next-price teaser settings

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-26 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# Only nullable columns and columns with a server default.
backward_compatible = True


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "requested_role",
            sa.Enum(
                "retail",
                "wholesale",
                "bulk_wholesale",
                "admin",
                name="requested_role",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=True,
        ),
    )
    op.add_column("users", sa.Column("upgrade_request_note", sa.Text(), nullable=True))
    # Existing requests were all retail -> wholesale.
    op.execute("UPDATE users SET requested_role = 'wholesale' WHERE wholesale_requested")

    op.add_column(
        "pricing_settings",
        sa.Column("show_next_tier", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column("pricing_settings", sa.Column("next_tier_terms", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("pricing_settings", "next_tier_terms")
    op.drop_column("pricing_settings", "show_next_tier")
    op.drop_column("users", "upgrade_request_note")
    op.drop_column("users", "requested_role")
