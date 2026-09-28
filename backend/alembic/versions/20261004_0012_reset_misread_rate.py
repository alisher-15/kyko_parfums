"""exchange rate: forget the rate the first version of the parser read

That parser took the EUR buy rate for the dollar (mig.kz shows a row "buy CODE sell" per
currency). The stored mig.kz rate is dropped so that the next visitor makes the shop read the
page again with the fixed parser. A rate typed by hand and the shift are kept.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-04 10:00:00

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0012"
down_revision: str | Sequence[str] | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# Data only, no schema change: older code sees a rate that has not been read yet.
backward_compatible = True


def upgrade() -> None:
    op.execute(
        "UPDATE exchange_rates SET source_rate = NULL, source_updated_at = NULL, "
        "checked_at = NULL, source_error = NULL"
    )


def downgrade() -> None:
    # The dropped rate was a misread; there is nothing to put back.
    pass
