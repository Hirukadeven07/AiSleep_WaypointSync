# Deploying to Railway (API) and Vercel (web)

An alternative to [deploy-vm.md](deploy-vm.md) that needs no server and no custom domain. Both platforms give HTTPS on their own domains, so phone GPS works. Everything below is done from the repo root with the `railway` and `vercel` CLIs, so no GitHub app access is needed.

| Piece | Host |
| --- | --- |
| `apps/web` (Next.js) | Vercel, `https://<name>.vercel.app` |
| `apps/api` (NestJS) | Railway service `api`, built from `apps/api/Dockerfile` |
| Postgres | Railway Postgres |
| Photos | Railway MinIO template (service `Bucket`), private bucket `photos` |
| Basemap | Same MinIO, public-read bucket `maps` |

The browser only talks to Vercel. Next.js rewrites `/api/*` to the Railway API (`API_INTERNAL_URL`) and `/maps/sri-lanka.pmtiles` to the `maps` bucket (`BASEMAP_URL`), so cookies stay first-party and no CORS is needed. The basemap (175 MB) is over Vercel's 100 MB file limit, which is why it lives in MinIO.

## 1. Railway

```bash
npm i -g @railway/cli
railway login
railway link -p <project> -e production
railway add -d postgres
railway deploy -t SMKOEA            # MinIO template; creates "Bucket" and "Console"
railway add -s api \
  -v 'NODE_ENV=production' -v 'PORT=3001' -v 'SESSION_TTL_HOURS=12' \
  -v 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  -v 'MINIO_ENDPOINT=${{Bucket.MINIO_PRIVATE_ENDPOINT}}' \
  -v 'MINIO_ROOT_USER=${{Bucket.MINIO_ROOT_USER}}' \
  -v 'MINIO_ROOT_PASSWORD=${{Bucket.MINIO_ROOT_PASSWORD}}' \
  -v 'MINIO_BUCKET=photos' \
  -v 'RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile'
railway up -s api --detach
railway domain -s api -p 3001
```

`RAILWAY_DOCKERFILE_PATH` is required: `railway up` does not pick up `railway.json`, and without it Railpack fails with "No start command detected".

`railway up` uploads the working tree, including the competition CSVs in `data/` that the seed reads. They are tracked in git, so a GitHub-connected Railway service would also have them.

Check `https://<api>.up.railway.app/api/health` returns `{"ok":true,"db":true}`. Every start runs `prisma migrate deploy` and the seed (an upsert), so redeploys are safe.

## 2. Basemap

Create the `maps` bucket with public read and upload the file in parts (Railway's proxy rejects a single 175 MB request):

```bash
S3_ENDPOINT=<Bucket MINIO_PUBLIC_ENDPOINT> S3_ACCESS=<MINIO_ROOT_USER> S3_SECRET=<MINIO_ROOT_PASSWORD> \
  node scripts/upload-basemap.mjs apps/web/public/maps/sri-lanka.pmtiles
```

The first time, create the bucket and its policy in the MinIO Console (Buckets > Create `maps` > Access Policy: public). Re-run the script only when the basemap changes.

## 3. Vercel

```bash
npm i -g vercel
vercel login
vercel link --project <name>      # project Root Directory: apps/web
vercel env add API_INTERNAL_URL production    # https://<api>.up.railway.app, no trailing slash
vercel env add BASEMAP_URL production         # https://<bucket public host>/maps/sri-lanka.pmtiles
vercel deploy --prod
```

Set both variables before deploying: rewrites are fixed at build time. Install and build commands come from `apps/web/vercel.json`; `.vercelignore` keeps node_modules, `.env`, the CSVs and the basemap out of the upload. On Windows Git Bash, prefix `vercel api` calls with `MSYS_NO_PATHCONV=1`.

Use the production alias (`https://<name>.vercel.app`). Per-deployment URLs sit behind Vercel login.

## 4. Verify

On a phone on mobile data, open the production URL, sign in with a seeded user (README logins, e.g. driver `kasun` / PIN `1234`), allow location, and check the map and a photo upload.

## Updating

- API: `railway up -s api --detach`
- Web: `vercel deploy --prod`

## Notes

- Railway's Config as Code (`railway.json`) stops working on 2026-12-01. `railway config migrate` writes `.railway/railway.ts`, but its output only keeps the health check: the Dockerfile path, builder and watch patterns become comments, and the restart policy is dropped. Before applying it, make sure `RAILWAY_DOCKERFILE_PATH` is still set on `api`, add the restart policy back, run `railway config plan`, and only then `railway config migrate --apply`. Note that `--apply` also clears the service's Config File setting on Railway.

- Live notices stream through a Vercel function (`app/api/notices/live`), which Hobby cuts off after a few minutes. The browser reconnects by itself.
- Cost: Vercel Hobby is free for non-commercial use. Railway has a one-time trial credit, then the Hobby plan (about $5 to $10 a month for API, Postgres and MinIO).
- Backups: Railway Postgres > Backups, or run `pg_dump` against its public URL.
