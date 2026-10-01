#!/usr/bin/env bash
# Nightly Postgres backup. Run from the repo root (or anywhere: it cd's there).
#
#   BACKUP_DIR      where dumps are kept          (default: <repo>/backups)
#   KEEP_DAYS       delete dumps older than this  (default: 14)
#   BACKUP_TARGET   optional off-machine copy, any rsync destination,
#                   e.g. user@otherhost:/srv/waypoint-backups/
#
# Cron (02:30 every night):
#   30 2 * * * /path/to/waypoint-sync/scripts/backup-db.sh >> /var/log/waypoint-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

BACKUP_DIR="${BACKUP_DIR:-$PWD/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB_USER="${POSTGRES_USER:-waypoint}"
DB_NAME="${POSTGRES_DB:-waypoint}"

mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/waypoint-$(date +%Y%m%d-%H%M%S).sql.gz"

docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner | gzip > "$file.part"
# a failed dump must never leave a file that looks like a good backup
gzip -t "$file.part"
mv "$file.part" "$file"
echo "$(date -Is) wrote $file ($(du -h "$file" | cut -f1))"

find "$BACKUP_DIR" -name 'waypoint-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

if [ -n "${BACKUP_TARGET:-}" ]; then
  rsync -a "$file" "$BACKUP_TARGET"
  echo "$(date -Is) copied to $BACKUP_TARGET"
fi
