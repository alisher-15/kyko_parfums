#!/bin/sh
# Updates the shop on the VPS to the latest `main`: a backup of the database, the code, a new
# build, then waits until the site answers. Run by GitHub Actions after CI passes on `main`
# (.github/workflows/deploy.yml, through the deploy key: see setup-deploy-key.sh) or by hand:
#   /opt/kyko/deploy/vps/deploy.sh
# Exits non-zero, and says why, when the site doesn't come back; the previous version is then
# one `git checkout <commit> && docker compose up -d --build` away (README «Обновление»).
set -eu
# `git merge` below may change this very file while the shell is still reading it: run a copy.
if [ "${KYKO_DEPLOY_COPY:-}" != "1" ]; then
  copy=$(mktemp)
  cp "$0" "$copy"
  KYKO_DEPLOY_COPY=1 exec sh "$copy" "$(cd "$(dirname "$0")" && pwd)"
fi
VPS=$1
REPO=$(cd "$VPS/../.." && pwd)
cd "$VPS"

# One update at a time: a second push while the first one builds waits for the next run.
exec 9>/tmp/kyko-deploy.lock
if ! flock -n 9; then
  echo "Another update is running; try again in a few minutes." >&2
  exit 75
fi

DOMAIN=$(grep -E '^DOMAIN=' "$VPS/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
if [ -z "$DOMAIN" ]; then
  echo "DOMAIN is not set in $VPS/.env" >&2
  exit 1
fi

echo "== backup"
"$VPS/backup.sh" deploy

echo "== code"
cd "$REPO"
before=$(git rev-parse --short HEAD)
git fetch -q origin main
git merge --ff-only -q origin/main
after=$(git rev-parse --short HEAD)
echo "version $before -> $after"

echo "== build and start"
cd "$VPS"
docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true

echo "== waiting for https://$DOMAIN"
i=0
until curl -fsS -o /dev/null --max-time 10 "https://$DOMAIN/api/health"; do
  i=$((i + 1))
  if [ "$i" -ge 36 ]; then
    echo "The site did not answer for 3 minutes after the update." >&2
    docker compose ps >&2
    docker compose logs --tail 60 app >&2
    exit 1
  fi
  sleep 5
done
for path in / /catalog /api/products?page_size=1 /api/categories; do
  code=$(curl -s -o /dev/null --max-time 15 -w '%{http_code}' "https://$DOMAIN$path")
  echo "$path $code"
  [ "$code" = "200" ] || { echo "$path answered $code" >&2; exit 1; }
done
echo "== done: $after is live on https://$DOMAIN"
