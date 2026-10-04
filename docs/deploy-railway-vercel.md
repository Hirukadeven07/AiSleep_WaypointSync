# Deploying to Railway (API) and Vercel (web)

An alternative to [deploy-vm.md](deploy-vm.md) that needs no server and no custom domain. Both platforms give HTTPS on their own domains, so phone GPS works.

| Piece | Host |
| --- | --- |
| `apps/web` (Next.js) | Vercel, `https://<name>.vercel.app` |
| `apps/api` (NestJS) | Railway, built from `apps/api/Dockerfile` (see `railway.json`) |
| Postgres | Railway Postgres |
| Photos | Railway MinIO template, with a volume |

The browser only talks to Vercel. Next.js rewrites `/api/*` to the Railway API (`API_INTERNAL_URL`), so session cookies stay first-party.

## 1. Railway: database, storage, API

1. railway.com > New Project > **Deploy from GitHub repo** > pick this repo. Railway reads `railway.json` and builds the API Dockerfile.
2. In that service: Settings > Source > **Branch**: the branch you deploy from (e.g. `main`).
3. In the project: **+ Create > Database > PostgreSQL**.
4. In the project: **+ Create > Template > MinIO**. Note the service name and its root user and password variables.
5. API service > **Variables**:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `PORT` | `3001` |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `SESSION_TTL_HOURS` | `12` |
   | `MINIO_ENDPOINT` | `http://${{<MinIO service>.RAILWAY_PRIVATE_DOMAIN}}:9000` |
   | `MINIO_ROOT_USER` | reference the MinIO service's root user variable |
   | `MINIO_ROOT_PASSWORD` | reference the MinIO service's root password variable |
   | `MINIO_BUCKET` | `photos` |

   Leave `DATA_DIR` unset: the image carries `data/` and the seed finds it.

6. API service > Settings > Networking > **Generate Domain** (port `3001`). Copy the URL.
7. Check `https://<api>.up.railway.app/api/health` returns `{"ok":true,"db":true}`.

Every start runs `prisma migrate deploy` and the seed (an upsert), so redeploys are safe.

## 2. Vercel: web

1. vercel.com > Add New > Project > import this repo.
2. **Root Directory**: `apps/web`. Framework, install and build commands come from `apps/web/vercel.json`.
3. **Environment Variables**: `API_INTERNAL_URL` = the Railway URL from step 1.6, no trailing slash. Set it before the first build: rewrites are fixed at build time.
4. Deploy, then Settings > Git > **Git Large File Storage: on**, and redeploy. Without it the Sri Lanka basemap (`public/maps/sri-lanka.pmtiles`, Git LFS) ships as a pointer file and the map is blank.
5. Settings > Git > **Production Branch**: the branch you deploy from. Preview URLs sit behind Vercel login (Deployment Protection), so phones should use the production URL.

## 3. Verify

On a phone on mobile data, open `https://<name>.vercel.app`, sign in with a seeded user (README logins, e.g. driver `kasun` / PIN `1234`), allow location, and check the map and a photo upload.

## Notes

- Pushes to the deploy branch redeploy both. Railway only rebuilds when API-side paths change (`watchPatterns` in `railway.json`).
- Live notices stream through a Vercel function (`app/api/notices/live`), which Hobby cuts off after a few minutes. The browser reconnects by itself.
- Cost: Vercel Hobby is free for non-commercial use. Railway has a one-time trial credit, then the Hobby plan (about $5 to $10 a month for API, Postgres and MinIO).
- Backups: Railway Postgres > Backups, or run `pg_dump` against its public URL.
