#!/bin/sh
# Nightly backup of the database: a compressed dump in $BACKUP_DIR (default /var/backups/kyko),
# the latest 14 kept. Run by cron (deploy/vps/README.md):
#   15 3 * * * /opt/kyko/deploy/vps/backup.sh >> /var/log/kyko-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
DIR=${BACKUP_DIR:-/var/backups/kyko}
mkdir -p "$DIR"
FILE="$DIR/kyko-$(date +%Y%m%d-%H%M).dump"
# The custom format restores with pg_restore, table by table if need be.
docker compose exec -T db pg_dump -U kyko -d kyko -Fc > "$FILE.part"
mv "$FILE.part" "$FILE"
ls -1t "$DIR"/kyko-*.dump | tail -n +15 | xargs -r rm --
echo "$(date '+%F %T') backup $FILE ($(du -h "$FILE" | cut -f1))"
