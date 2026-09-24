#!/bin/sh
# API for the browser tests: an empty database, migrations, admin + demo catalog, then uvicorn.
# The log goes to e2e/.logs/backend.log (the password-reset test reads the reset link from it).
set -e
E2E_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$E2E_DIR/../backend"
export PYTHONPATH="$PWD${PYTHONPATH:+:$PYTHONPATH}"  # reset_db.py imports the app

PYTHON="${PYTHON:-python}"
export DATABASE_URL="${E2E_DATABASE_URL:-postgresql+psycopg://kyko:kyko@localhost:5432/kyko_e2e}"
export JWT_SECRET="e2e-secret-with-enough-length-for-hs256"
export ADMIN_EMAIL=admin ADMIN_PASSWORD=admin12345 SEED_DEMO=true SMTP_HOST=""

mkdir -p "$E2E_DIR/.logs"
LOG="$E2E_DIR/.logs/backend.log"
: > "$LOG"
"$PYTHON" "$E2E_DIR/scripts/reset_db.py" >> "$LOG" 2>&1
"$PYTHON" -m app.cli migrate >> "$LOG" 2>&1
"$PYTHON" -m app.cli bootstrap >> "$LOG" 2>&1
exec "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >> "$LOG" 2>&1
