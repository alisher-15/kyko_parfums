"""Give the browser tests an empty database (created if missing).

Run from backend/ with DATABASE_URL pointing at the test database. Refuses any database whose
name does not contain "e2e" or "test", so it can never wipe real data.
"""

import sys

from sqlalchemy import create_engine, make_url, text

from app.config import get_settings

url = make_url(get_settings().database_url)
if not any(tag in (url.database or "") for tag in ("e2e", "test")):
    sys.exit(f"Refusing to wipe database {url.database!r}: its name must contain 'e2e' or 'test'")

server = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
with server.connect() as conn:
    exists = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database})
    if not exists:
        conn.execute(text(f'CREATE DATABASE "{url.database}"'))
server.dispose()

with create_engine(url).begin() as conn:
    conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
print(f"Database {url.database} is empty")
