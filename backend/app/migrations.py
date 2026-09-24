"""Which code can run on which database schema.

Every migration declares `backward_compatible`: whether the code from before it still works on
the schema after it. True for new tables, nullable columns, columns with a server default and
looser constraints (new allowed values included); False for NOT NULL columns without a default,
drops, renames and stricter constraints. It is a question about the schema only: the case it
guards is a deploy that failed after migrating, when the new code has not written any data yet.

After every Alembic run (see alembic/env.py) the database stores in `schema_compat` the revision
of the newest breaking migration: the oldest code that can run on it. On start `migrate()` upgrades
the database as usual. When the database is newer than the code (a failed deploy migrated it and
the platform kept the previous build), the code starts only if it knows that revision. Otherwise
it refuses to start instead of failing on the first order.

Builds already in production read `schema_compat`, so its name and columns must never change.
"""

import sys
from collections.abc import Sequence
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Connection, inspect, text

from alembic import command
from app.db import engine

COMPAT_TABLE = "schema_compat"


def alembic_config() -> Config:
    return Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))


def min_code_revision(script: ScriptDirectory, heads: Sequence[str]) -> str:
    """Revision of the newest breaking migration up to `heads`; the base one counts as breaking."""
    revisions = list(script.iterate_revisions(tuple(heads), "base"))  # newest first
    for rev in revisions:
        compatible = getattr(rev.module, "backward_compatible", None)
        if not isinstance(compatible, bool):
            raise RuntimeError(
                f"Migration {rev.revision} must set backward_compatible = True or False "
                "(see app/migrations.py)"
            )
        if not compatible:
            return rev.revision
    return revisions[-1].revision


def record_compat(connection: Connection, script: ScriptDirectory, heads: Sequence[str]) -> None:
    """Store the oldest code revision that can run on the schema (called by alembic/env.py)."""
    if not heads or not inspect(connection).has_table(COMPAT_TABLE):
        return  # below the migration that creates the table
    connection.execute(
        text(
            f"INSERT INTO {COMPAT_TABLE} (id, min_code_revision) VALUES (1, :rev) "
            "ON CONFLICT (id) DO UPDATE SET min_code_revision = EXCLUDED.min_code_revision"
        ),
        {"rev": min_code_revision(script, heads)},
    )


def read_min_code_revision(connection: Connection) -> str | None:
    if not inspect(connection).has_table(COMPAT_TABLE):
        return None
    return connection.scalar(text(f"SELECT min_code_revision FROM {COMPAT_TABLE}"))


def migrate() -> int:
    """`alembic upgrade head` that knows what to do with a database newer than the code.

    Returns the process exit code.
    """
    cfg = alembic_config()
    script = ScriptDirectory.from_config(cfg)
    known = {rev.revision for rev in script.walk_revisions()}
    with engine.connect() as conn:
        current = MigrationContext.configure(conn).get_current_heads()
        unknown = [rev for rev in current if rev not in known]
        required = read_min_code_revision(conn) if unknown else None

    if not unknown:
        command.upgrade(cfg, "head")
        return 0

    database, code = ", ".join(unknown), script.get_current_head()
    if required in known:
        print(
            f"Database is at revision {database}, newer than this code ({code}), but works with "
            f"code from {required} on — starting without migrations",
            file=sys.stderr,
        )
        return 0
    print(
        f"Database is at revision {database} and needs code from revision {required or '?'} on, "
        f"this code only goes up to {code}. Deploy the newer version — not starting.",
        file=sys.stderr,
    )
    return 1
