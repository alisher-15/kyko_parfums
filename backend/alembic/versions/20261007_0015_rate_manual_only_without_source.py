"""exchange_rates: a manual rate only stands in while mig.kz has given none

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-07 10:00:00

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0015"
down_revision: str | Sequence[str] | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# Only data changes: the old code reads a NULL manual rate as "use mig.kz".
backward_compatible = True


def upgrade() -> None:
    # A rate typed by hand used to replace mig.kz until cleared; now mig.kz plus the adjustment
    # wins, so a leftover manual rate next to a mig.kz rate is dropped.
    op.execute("UPDATE exchange_rates SET manual_rate = NULL WHERE source_rate IS NOT NULL")


def downgrade() -> None:
    pass
