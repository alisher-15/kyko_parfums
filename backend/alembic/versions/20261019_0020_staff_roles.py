"""staff roles: a cashier and a warehouse worker, each with part of the admin panel

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-19 20:00:00

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0020"
down_revision: str | Sequence[str] | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# Looser CHECK constraints: yes.
backward_compatible = True

OLD = ("retail", "wholesale", "bulk_wholesale", "admin")
NEW = (*OLD, "cashier", "warehouse")
# (constraint, table, column) of every column that holds a role.
COLUMNS = (
    ("user_role", "users", "role"),
    ("requested_role", "users", "requested_role"),
    ("order_customer_role", "orders", "customer_role"),
)


def _check(roles: tuple[str, ...]) -> None:
    for name, table, column in COLUMNS:
        op.drop_constraint(name, table, type_="check")
        values = ", ".join(f"'{r}'" for r in roles)
        op.create_check_constraint(name, table, f"{column} IN ({values})")


def upgrade() -> None:
    _check(NEW)


def downgrade() -> None:
    # Staff accounts become customers again, and their orders retail ones.
    op.execute("UPDATE users SET role = 'retail' WHERE role IN ('cashier', 'warehouse')")
    op.execute(
        "UPDATE orders SET customer_role = 'retail' WHERE customer_role IN ('cashier', 'warehouse')"
    )
    _check(OLD)
