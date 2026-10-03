#!/bin/sh
# Pull main and rebuild the Compose stack when it changed.
# Run this from a dedicated clone (not a working checkout). Safe to repeat.
set -eu
cd "$(dirname "$0")/.."

git fetch origin main
local_rev=$(git rev-parse HEAD)
remote_rev=$(git rev-parse origin/main)

if [ "$local_rev" = "$remote_rev" ]; then
  echo "Already at $local_rev"
  exit 0
fi

git checkout main
git pull --ff-only origin main
git lfs pull

if [ -f .env ] && grep -Eq '^CLOUDFLARE_TUNNEL_TOKEN=.+' .env; then
  docker compose --profile public up -d --build
else
  docker compose up -d --build
fi

docker compose ps
