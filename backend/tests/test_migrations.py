import pytest
from alembic.script import ScriptDirectory
from sqlalchemy import text

from alembic import command
from app.db import engine
from app.migrations import alembic_config, migrate

SCRIPT = ScriptDirectory.from_config(alembic_config())


def test_every_migration_says_whether_older_code_still_works():
    for rev in SCRIPT.walk_revisions():
        assert isinstance(getattr(rev.module, "backward_compatible", None), bool), rev.revision


def marker() -> str:
    with engine.connect() as conn:
        return conn.scalar(text("SELECT min_code_revision FROM schema_compat"))


def test_database_records_the_oldest_code_it_can_run_with():
    # 0003 is the newest migration that older code can't run on (0004 and 0005 only add things).
    assert marker() == "0003"

    # The marker follows downgrades and upgrades.
    cfg = alembic_config()
    command.downgrade(cfg, "0004")
    command.upgrade(cfg, "head")
    assert marker() == "0003"


@pytest.fixture
def newer_database():
    """newer_database(revision, min_code) pretends a newer deploy migrated the database."""
    with engine.connect() as conn:
        saved = (conn.scalar(text("SELECT version_num FROM alembic_version")), marker())

    def _set(revision: str, min_code: str) -> None:
        with engine.begin() as conn:
            conn.execute(text("UPDATE alembic_version SET version_num = :v"), {"v": revision})
            conn.execute(text("UPDATE schema_compat SET min_code_revision = :v"), {"v": min_code})

    yield _set
    _set(*saved)


def test_migrate_at_head_does_nothing():
    assert migrate() == 0


def test_starts_on_a_newer_database_that_still_works_with_this_code(newer_database, capsys):
    # A deploy added backward compatible migrations, failed, and the platform kept this build.
    newer_database("0007", "0003")
    assert migrate() == 0
    assert "starting without migrations" in capsys.readouterr().err


def test_refuses_a_newer_database_that_needs_newer_code(newer_database, capsys):
    newer_database("0007", "0006")
    assert migrate() == 1
    assert "not starting" in capsys.readouterr().err
