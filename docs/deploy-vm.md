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

`docker-compose.yml` is written for local development, so check these:

- **Published ports.** `db` (5432), `minio` (9000, 9001) and `web` (3000) are published on the VM's host. The file's own comment says to remove the db port in production. Remove those `ports:` entries or block them with the VM firewall so only the tunnel is public.
- **Restart on reboot.** No service has a `restart:` policy, so a VM reboot leaves the stack down. Add `restart: unless-stopped` to each service and run `sudo systemctl enable docker`.
- **Default credentials.** Change the seeded user secrets if the data is real; the README logins are demo values.

## 8. Day-to-day

```bash
git pull
docker compose --profile public up -d --build   # update
docker compose logs -f api                       # logs
docker compose --profile public down             # stop (keeps volumes)
```

Do not run `docker compose down -v` or `pnpm seed:reset` on the VM unless you intend to wipe the database.
