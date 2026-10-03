# Deploying to the VM (public, via Cloudflare Tunnel)

For whoever has SSH access to the VM and the `CLOUDFLARE_TUNNEL_TOKEN`. This brings up the whole stack (Postgres, MinIO, API, web) and the `cloudflared` tunnel so phones can reach the app. Backups are a separate task and are not covered here.

## 1. Prerequisites

- SSH access to the VM
- Docker with the Compose plugin (`docker compose version`) and git
- A Cloudflare Tunnel token: Cloudflare Zero Trust > Networks > Tunnels > your tunnel

## 2. Get the code

```bash
git clone https://github.com/Hirukadeven07/AiSleep_WaypointSync.git waypoint-sync
cd waypoint-sync
git checkout main
ls data/   # the competition CSVs must be here; the API mounts ./data read-only
```

## 3. Create `.env`

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `POSTGRES_PASSWORD` | a strong password (the default is `waypoint`) |
| `MINIO_ROOT_PASSWORD` | a strong password (the default is `waypoint-secret`) |
| `CLOUDFLARE_TUNNEL_TOKEN` | the tunnel token |
| `DEMO_NOW`, `NEXT_PUBLIC_DEMO_NOW` | leave empty unless demoing |
| `NPM_REGISTRY`, `PRISMA_ENGINES_MIRROR`, `GOPROXY` | only change these if the VM cannot reach the public registries |

`DATABASE_URL` is built from the `POSTGRES_*` values inside `docker-compose.yml`, so you do not need to edit it.

## 4. Point the tunnel at the web service

In the Cloudflare dashboard, open the tunnel > Public Hostname > add a hostname:

- Service type: `HTTP`
- URL: `web:3000`

`cloudflared` runs in the same Compose network, so it reaches the web container by name.

## 5. Start the stack

```bash
docker compose --profile public up -d --build
```

On every start the API container runs `prisma migrate deploy` and `pnpm run seed`. The seed upserts. It only wipes tables when `SEED_RESET=1` is set, which Compose does not set, so restarts are safe.

## 6. Verify

```bash
docker compose ps                       # db, minio, api, web, cloudflared all Up
docker compose logs -f api cloudflared  # API listening on 3001; tunnel "Registered tunnel connection"
```

Then, from a phone on mobile data (not the VM's network), open the public hostname and sign in with a seeded user (see the README logins, e.g. driver `kasun` / PIN `1234`).

## 7. Before real use: hardening

`docker-compose.yml` already binds `db` (5432) and `minio` (9000, 9001) to `127.0.0.1` and sets `restart: unless-stopped` on every service. Still to do:

- **`web` (3000) is published on all interfaces.** With the tunnel in front you do not need that. Block 3000 in the VM firewall or security group.
- **Docker must start on boot:** `sudo systemctl enable docker`.
- **Default credentials.** Change the seeded user secrets if the data is real; the README logins are demo values.

## 8. Day-to-day

```bash
git pull
git lfs pull
docker compose --profile public up -d --build   # update
docker compose logs -f api                       # logs
docker compose --profile public down             # stop (keeps volumes)
```

`scripts/update-from-main.sh` does that pull and rebuild, and skips the rebuild when `main` has not moved. The Sri Lanka basemap is Git LFS, so the VM needs `git lfs` installed (`git lfs pull` after every update).

Do not run `docker compose down -v` or `pnpm seed:reset` on the VM unless you intend to wipe the database.

## 8a. Update the demo when main changes

A push to `main` runs `.github/workflows/deploy.yml`, which SSHs to this VM and runs `scripts/update-from-main.sh`. Until the secrets exist, that workflow skips and the demo stays as it is.

In the GitHub repo: Settings > Secrets and variables > Actions:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | VM hostname or IP |
| `DEPLOY_USER` | SSH user that can run Docker |
| `DEPLOY_SSH_KEY` | private key for that user |
| `DEPLOY_PATH` | optional clone path; default `/opt/AiSleep_WaypointSync` |

The deploy user must be allowed to run `docker` without a password prompt. This clone should stay on `main`. Do not develop in it.

## 9. Nightly database backup

`scripts/backup-db.sh` dumps Postgres to `backups/waypoint-<timestamp>.sql.gz` and deletes dumps older than `BACKUP_KEEP_DAYS` (default 14). `scripts/restore-db.sh` loads one back. `scripts/crontab.example` has the nightly schedule line (00:15 Asia/Colombo).

```bash
./scripts/backup-db.sh                                  # run once to test
crontab -e                                              # then paste the line from scripts/crontab.example
./scripts/restore-db.sh backups/waypoint-XXXX.sql.gz    # restore (replaces objects in the database)
```

A backup on the same disk does not survive losing that disk. Copy the dumps somewhere else regularly (another machine, or object storage).

On Windows (Docker Desktop) use `scripts/backup-db.ps1` from Task Scheduler:
`powershell -NoProfile -ExecutionPolicy Bypass -File "D:\path\to\waypoint-sync\scripts\backup-db.ps1"`. Set `BACKUP_COPY_DIR` to a folder on another drive or a synced folder for the off-machine copy.
