#!/bin/sh
# Entrypoint of the all-in-one image: migrations -> bootstrap -> API in background -> Next.js.
set -e

cd /app/backend
# `alembic upgrade head` that also copes with a database a newer deploy already migrated.
python -m app.cli migrate
python -m app.cli bootstrap
uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers &
API_PID=$!

# Wait for the API so the first requests don't fail.
for i in $(seq 1 30); do
  python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')" 2>/dev/null && break
  sleep 1
done

cd /app/frontend
node server.js &
WEB_PID=$!

# Exit (and let the platform restart us) if either process dies.
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 5
done
echo "A process exited — stopping container" >&2
exit 1
