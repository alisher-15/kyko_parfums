#!/bin/sh
# Backup of the database: a compressed dump in $BACKUP_DIR (default /var/backups/kyko). Nightly by
# cron (deploy/vps/README.md), the latest 14 kept:
#   15 3 * * * /opt/kyko/deploy/vps/backup.sh >> /var/log/kyko-backup.log 2>&1
# `backup.sh deploy` (deploy.sh, before every update) writes kyko-deploy-*.dump, the latest 10
# kept apart: a day of many updates must not push the nightly copies out.
set -eu
# The dumps hold every customer's data and password hashes: readable by root only.
umask 077
cd "$(dirname "$0")"
DIR=${BACKUP_DIR:-/var/backups/kyko}
mkdir -p "$DIR"
chmod 700 "$DIR"
if [ "${1:-}" = "deploy" ]; then
  PREFIX="kyko-deploy-"
  KEEP=10
else
  PREFIX="kyko-"
  KEEP=14
fi
FILE="$DIR/$PREFIX$(date +%Y%m%d-%H%M%S).dump"
# The custom format restores with pg_restore, table by table if need be.
docker compose exec -T db pg_dump -U kyko -d kyko -Fc > "$FILE.part"
mv "$FILE.part" "$FILE"
# Nightly names start with the date (kyko-2…), the deploy ones with «deploy».
if [ "$PREFIX" = "kyko-deploy-" ]; then
  ls -1t "$DIR"/kyko-deploy-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm --
else
  ls -1t "$DIR"/kyko-[0-9]*.dump | tail -n +$((KEEP + 1)) | xargs -r rm --
fi
echo "$(date '+%F %T') backup $FILE ($(du -h "$FILE" | cut -f1))"
