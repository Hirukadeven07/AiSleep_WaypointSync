#!/usr/bin/env bash
# Restore a gzip dump into the Compose `db` service. This replaces objects in POSTGRES_DB.
set -euo pipefail

dump="${1:?usage: $0 path/to/waypoint-YYYYMMDD-HHMMSS.sql.gz}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$dump" ]]; then
  echo "error: dump not found: $dump" >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-waypoint}"
POSTGRES_DB="${POSTGRES_DB:-waypoint}"

if ! docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
  echo "error: db container is not running or not ready" >&2
  exit 1
fi

echo "Restoring $dump into ${POSTGRES_DB} (this replaces existing objects in that database)." >&2
gunzip -c "$dump" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
echo "restore finished"
