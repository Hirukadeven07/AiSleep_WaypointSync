# Waypoint Sync

## Overview

Waypoint Sync is a delivery planning web app built for Rootcode's Tech-Triathlon 2026 Hackathon. One web app serves four roles, each with its own layout:

| Role | Route | Device |
| --- | --- | --- |
| Dispatcher | `/dispatch` (Sync Console) | Desktop |
| Loader | `/dock` (Sync Dock) | Tablet, also usable at 390 px |
| Driver | `/drive` (Sync Driver) | Phone, installable PWA |
| Store manager | `/store` (Sync Store) | Phone and desktop |

Stack: TypeScript, pnpm workspaces, Next.js (App Router) + Tailwind, NestJS, PostgreSQL 16 + Prisma, MinIO, polling for live updates.

## Quick start

```bash
cp .env.example .env
docker compose up
```

Open http://localhost:3000. Postgres, MinIO, the API (migrations + seed) and the web app all start; no Cloudflare account is needed.

## Seeded logins

| Role | Login ID | Secret | Notes |
| --- | --- | --- | --- |
| Dispatcher | `nimal` | password `waypoint` | Depot Peliyagoda |
| Store manager | `sunil` | password `waypoint` | First Peliyagoda Fresh store (if `data/outlets.csv` is loaded) |
| Loader | dock password `123456` (Peliyagoda) / `654321` (Kandy) | then loader ID + PIN at Start loading (`sampath` / `1234`) | Shared dock tablet |
| Driver | `kasun` | PIN `1234` | Depot Peliyagoda |

## Local development

```bash
corepack enable
pnpm install
docker compose up db minio        # database + object storage
cp .env.example .env              # then set DATABASE_URL host to localhost for local runs
pnpm --filter @waypoint/api exec prisma migrate deploy
pnpm seed
pnpm dev                          # web on :3000, api on :3001
```

Useful commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm seed:reset`, `pnpm db:studio`.
`packages/*` compile to `dist`; `pnpm dev`, `pnpm typecheck` and `pnpm test` build them first.

## Public deployment (Cloudflare Tunnel)

Set `CLOUDFLARE_TUNNEL_TOKEN` in `.env`, then:

```bash
docker compose --profile public up -d
```

## Database backups

Dumps stay on the VM for now (the `backups/` folder is gitignored). Copying them off the VM (R2, S3, or `scp`) is still TODO.

On the VM, from the repo root, with the Compose stack running:

```bash
chmod +x scripts/backup-db.sh scripts/restore-db.sh
./scripts/backup-db.sh
```

That writes `backups/waypoint-YYYYMMDD-HHMMSS.sql.gz` and deletes dumps older than `BACKUP_KEEP_DAYS` (default 14). Credentials come from `.env` (`POSTGRES_USER`, `POSTGRES_DB`).

Install the nightly job with `crontab -e` using [`scripts/crontab.example`](scripts/crontab.example) (Asia/Colombo, 00:15). Change `/opt/AiSleep_WaypointSync` to the clone path.

A backup is unproven until it has been restored once. This **replaces objects** in `POSTGRES_DB`:

```bash
./scripts/restore-db.sh backups/waypoint-YYYYMMDD-HHMMSS.sql.gz
```

Prefer restoring into a throwaway database or a staging clone, not blindly onto the live demo DB.

## Project structure

```
apps/web            Next.js app (all four role layouts)      - shells + plan board: Methuli; trip drawer + dispatch: Sehara; dock + store: Hiruka; driver: Nithika
apps/api            NestJS API + Prisma schema and seed      - platform/infra: Yohan; data + seed: Sanaya
packages/domain     Pure business rules, Vitest tests        - Sithil
packages/contracts  Shared types                             - shared
data/               Competition CSVs                         - Sanaya
docs/               Architecture, data model, AI disclosure  - Chamodhi
```

## Judge walkthrough

_To be written._

## Departures from the Designathon design

The web app follows the Figma file "AI-Sleep_Designathon". Where it does not, the reason is here. Anything the Figma shows that the data does not have yet is left out rather than invented.

### Layout and breakpoints

- The Figma gives frame sizes (1440 desktop, 412 phone), not breakpoints. Desktop layouts start at 1024px; below that the phone layout is used. The Figma has no tablet design.
- The store app has no desktop design, so on a laptop it stays a centred phone column.
- The dispatcher console and the plan board are built for the 1440 desktop console. On narrow screens the console rail collapses to a scrolling strip and the plan board's trip rows truncate their titles instead of reflowing.

### Landing page and sign-in

- Signed-in visitors skip the landing page and go straight to their workspace. Every "Sign in" and workspace card goes to the role chooser, because the Figma has no role parameter.
- **Sync Dock sign-in (L1):** the tablet is unlocked with the depot's shared 6-digit dock password (stored hashed on the `Depot` row: seeded `depo1` = 123456, `depo2` = 654321; change it in Account settings). There is no loader ID on that screen. Each person who joins a load taps **Start loading** (or **+ Add a loader** once started), enters their own loader ID and PIN if they have one (seeded L001… have no PIN, so the box stays blank; `sampath` uses 1234), and is added to the trip's loader list only when the API confirms them. Delivery notes are attributed to those loaders, not to the shared tablet account.
- Depot cards show the depot name only; "12 trips today" has no data behind it yet.
- "Forgot password?" is drawn but not wired. "Keep me signed in" and "Remember this phone" only remember the login id on the device, because the API sets the session length.

### Shells

- **Dark mode** is not in the Figma. Every app's account menu has a Dark mode switch; the choice is kept on the device, and with no choice the app follows the phone or computer setting. Dark colours keep the Figma's roles (canvas, surface, text, status tints); navy fills, the SOS red and the signature pad stay as designed, and the maps keep their light style.
- The Figma has no sign-out, so it lives in an account menu: the rail avatar on the console, the account pill on the dock, and a slim avatar row at the top of phone screens (the Figma `Driver / Profile` frame should replace that row).
- The console's Settings button and the Incidents red dot are drawn but not wired.
- The driver sidebar card shows the name and depot, not "DRV-2031", because the session has no driver number.

### Driver app

- **Home:** the trip title has no district ("Trip 1 · Colombo"), and there are no departure times, item counts or vehicle temperature range, because the driver payload does not return them. The vehicle reads "Truck" or "Van", not "Refrigerated".
- **SOS:** shows "Dispatch · <depot>" instead of the dispatcher's name. There is no desktop frame, so the same red page is centred. Opening it sends one alert through the offline outbox; there is no confirm step.
- **Offline:** the banner counts "actions" because the outbox holds more than deliveries. When online with actions still waiting, the green line reads "Online · N waiting to sync" (the Figma only shows the all-synced state).
- Loading, wrong-account and "no signal and nothing saved" have no Figma frame, so they show a blank canvas, a redirect to `/no-access`, and only the offline banner.
- Still placeholders: Trip overview, Next stop, Waiting for store, Report issue, Break, Vehicle and the other driver screens.

### Plan board (dispatcher)

- **One district per trip is a warning, not a block.** The build plan lists "one brand, one district" as a hard rule. Brand still blocks, but a trip may take stores from more than one district (the dispatcher picks them when creating the trip, and a store from another district shows a warning). This came in with multi-district trips (PR #43).
- **Map view** is not built; the List / Map switch shows Map disabled.
- **Ready vs Draft** is derived: Draft means a trip has no stops yet or a domain warning other than fuel (fuel is judged per week, which the board does not total yet); Ready means clean. "Capacity used" is planned weight against the vehicles that have a trip. "Moved 2x" means a repeat-skip, because the data has no move counter. The Fresh run is assumed to leave at 03:30 and the other brands at 08:00 for the window-risk check.
- **Publishing:** the Figma shows "Publish anyway" for an over-volume trip, but capacity problems block publishing (build plan and domain rules): the button is disabled and a line says why. Other warnings, such as a window at risk, can be published through. A trip with no stops is skipped.
- **Refusals** (a rule broken on drop) have no Figma frame, so they reuse the drop-hint pill and toast in red. The drop hint sits on the bottom edge of the hovered trip rather than inside it.
- **Order drawer:** the warning says "Already moved twice (reason)"; the Figma's "about 30% stock left" has no data. Dropping a stop back on the queue takes it off its trip, which the Figma does not show.
- **Move to later:** the new date is a plain row (the next operating day, no date picker); the "3rd time" notice shows only for orders moved before; the store message says "first in line" where the Figma has "first in item". Undo on its toast brings the order back to the queue, not to its old trip.
- **Auto-assign:** no "1 problem fixed" card and no "Review on board". The domain proposal only places waiting orders and never moves stops between trips. Applying it moves orders that cannot be placed to a later day, with the reason inferred (chilled, van-only, otherwise window).
- The date line is computed, so it can read "Thu, 1 Oct" where the Figma sample says "Wed".
- **Changing a sent trip:** the Figma has no re-publish step. A sent trip that has not left the depot can still take, lose or swap stops on the board, and each change goes to the dock at once as a new plan version. Being over capacity blocks the drop on a sent trip, because a published plan must stay inside capacity. The loader's checklist pauses (the dock plan-change lock) until they accept the change.

### Data

- The competition CSVs are not in `data/` in the repository, so the plan board has only been tried on a small demo day. Seed the real files (`docs/data-model.md`) before judging.

## Docs

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [AI disclosure](docs/ai-disclosure.md)
- [Screen map](docs/screen-map.md)
- [VM deployment runbook](docs/deploy-vm.md)

## Setup notes

- The Nest modules were generated by script with the same layout the Nest CLI produces.
- `packages/*` are built to CommonJS in `dist` so both Nest and Next can consume them.
- `pnpm test` runs unit tests only. The auth e2e test (`pnpm --filter @waypoint/api test:e2e`) needs a running, seeded database.
- CSV column names are matched loosely (case and separators ignored). Check `apps/api/prisma/seed/load-csv.ts` against the real files and adjust aliases if a column is missed.
- Driver PWA icon is a placeholder SVG.
