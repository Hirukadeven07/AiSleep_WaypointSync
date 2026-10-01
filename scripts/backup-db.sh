#!/usr/bin/env bash
# Dump Postgres from the Compose `db` service. Run from any cwd; uses the repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-waypoint}"
POSTGRES_DB="${POSTGRES_DB:-waypoint}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

if ! docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
  echo "error: db container is not running or not ready (start the stack first)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
out="$BACKUP_DIR/waypoint-${stamp}.sql.gz"

docker compose exec -T db pg_dump \
  --clean --if-exists \
  -U "$POSTGRES_USER" \
  "$POSTGRES_DB" | gzip >"$out"

echo "wrote $out"

if [[ "$BACKUP_KEEP_DAYS" =~ ^[0-9]+$ ]] && [[ "$BACKUP_KEEP_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -name 'waypoint-*.sql.gz' -mtime "+${BACKUP_KEEP_DAYS}" -delete
fi
