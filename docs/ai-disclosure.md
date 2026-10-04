# AI disclosure

How the Waypoint Sync team used AI tools to build this project, what the evidence is, and how AI-written work was checked. Built for Rootcode's Tech-Triathlon 2026 Hackathon (commits from 30 Sep to 4 Oct 2026).

## Summary

- **The product contains no AI.** Waypoint Sync does not call any AI model or service at run time. Planning, auto-assign, ETAs, fuel and every other decision are ordinary, deterministic TypeScript rules (`packages/domain`) that can be tested.
- **AI coding assistants helped build it.** The team used **Claude Code** (models Claude Opus 5.5 and Claude Sonnet 5.5) and **Cursor**.
- **About two thirds of commits credit an AI assistant:** 114 of the 172 non-merge commits on all branches carry a `Co-Authored-By` line naming Claude or Cursor.
- **Every commit is under a team member's name.** Work reached `main` through 83 merged pull requests, and CI runs lint, typecheck, unit tests, API end-to-end tests and Docker builds on every pull request.

---

## 1. AI in the product

None. We checked:

| Check | Result |
| --- | --- |
| Dependencies in every `package.json` | No AI or ML SDKs (no OpenAI, Anthropic, LangChain, TensorFlow, ONNX…) |
| Source code in `apps/`, `packages/`, `scripts/`, `tools/` | No calls to AI services or models |
| Outbound network calls from the API | Only the public OSRM road router (driving times and road lines) and MinIO photo storage |
| "Smart" features | **Auto-assign**, **vehicle fit**, **deferral**, **ETAs**, **window risk** and **fuel** are hand-written rules in `packages/domain` with Vitest tests. They give the same answer for the same input |

The "AI" in "AI-Sleep" is the team name (Figma file "AI-Sleep_Designathon"). It does not describe a feature.

---

## 2. Tools used to build it

| Tool | Model | How it was used |
| --- | --- | --- |
| Claude Code (CLI, desktop and IDE) | Claude Opus 5.5 | Writing and changing code across the API, web app and contracts; tests; docs; fixing CI failures |
| Claude Code | Claude Sonnet 5.5 | Web app changes and the depot dock password feature (API, web app, seed) |
| Cursor (AI code editor) | Not recorded in commits | Writing code, docs, schema diagrams and scripts |

---

## 3. Evidence: commit credit lines

Assistants add a credit line to each commit they help write, for example:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Co-authored-by: Cursor <cursoragent@cursor.com>
```

We counted these lines across every branch with `git log --all --no-merges`.

| AI credit | Commits |
| --- | --- |
| Claude Opus 5.5 | 67 |
| Claude Sonnet 5.5 | 9 |
| Cursor | 38 |
| **Any AI credit** | **114 of 172 (66%)** |
| No AI credit | 58 |

**Read this carefully:**

- A credit line means an assistant helped write that commit. It does not mean the assistant wrote all of it, or that no person wrote or changed the code.
- **No credit line does not prove no AI was used.** Some tools and workflows (chat assistants, editor autocomplete, copy and paste) add no credit line. Section 6 has each member's own statement.
- Merge commits are excluded; they only join branches.

### By team member

Git author names are matched to the team list in the [README](../README.md#project-structure) where the match is clear.

| Team member (git author) | Area (README) | Commits | With AI credit | Tools credited |
| --- | --- | --- | --- | --- |
| Nithika (`Nithika_zen`) | Driver app | 52 | 48 | Claude Opus 5.5 (41), Claude Sonnet 5.5 (7) |
| Methuli (`methuliH`) | Shells, plan board | 31 | 2 | Claude Sonnet 5.5 |
| Yohan (`yohanruchitha2-star`) | Platform and infrastructure | 30 | 30 | Cursor |
| Hiruka (`Hirukadeven07`) | Dock and store | 24 | 13 | Claude Opus 5.5 |
| Sithil (`sithilyapa717`) | Domain rules | 22 | 8 | Cursor |
| Sehara (`SeharaChami`) | Trip drawer, dispatch | 8 | 8 | Claude Opus 5.5 |
| `KithnulaoEdirisinghe` | Store manager screens | 4 | 4 | Claude Opus 5.5 |
| Chamodhi (`Chamodi`) | Docs | 1 | 1 | Claude Opus 5.5 |
| **Total** | | **172** | **114** | |

`KithnulaoEdirisinghe` is not in the README's team table. Sanaya (data and seed in the README) has no commits under that name; their work may have been committed by someone else.

### By part of the code

Number of commits that touched each part. One commit can touch several parts.

| Part | Claude Opus 5.5 | Claude Sonnet 5.5 | Cursor | No AI credit |
| --- | --- | --- | --- | --- |
| `apps/web` (all four role apps) | 43 | 9 | 15 | 28 |
| `apps/api` (NestJS API, Prisma, seed) | 42 | 2 | 22 | 28 |
| `packages/contracts` (shared types) | 25 | 2 | 17 | 19 |
| `packages/domain` (planning rules) | 4 | – | 1 | 3 |
| `docs/` and `README.md` | 11 | 2 | 14 | 13 |
| `scripts/`, `tools/` | 1 | – | 7 | 2 |
| Repo setup (CI, Docker, lint, tsconfig, pnpm, env) | 5 | – | 6 | 7 |

What this shows:

- **The API, the web app and the shared contracts were built with heavy AI help.**
- **Most commits to the planning rules (`packages/domain`) still credit an AI** (5 of 8), but there are few of them and each has unit tests.
- **Documentation and repo setup also lean on AI:** 27 of 40 docs commits and 11 of 18 setup commits credit an assistant.

---

## 4. What AI was used for

From the commit messages of AI-credited commits:

| Kind of work | Examples |
| --- | --- |
| Features | Driver trip overview, next stop, waiting and acknowledgement, road issues; store saved items, urgent orders and cancelling; multi-district trips; incident logging; vehicles and fleet; live notices; trip report PDF; light and dark theme |
| API and data | Dock and store records in the team ERD tables, the missing `DriverEvent.driverId` foreign key, per-event validation in driver sync, depot contacts, district names as keys |
| Fixes | Back after sign-out showing the app, map zoom snapping back, SOS counts on Home vs Incidents, type errors that failed the web build |
| Tests | Dock and store e2e tests, fixing broken e2e setups, unit tests next to new logic |
| Maps | Offline Sri Lanka map for planning and live dispatch, legends, every store on the map |
| Tooling | The local check page (`tools/local-admin`), lint fixes, TypeScript config clean-up |
| Documentation | Data model, database constraints, schema diagrams aligned with Prisma, the dock and store docs, this repository's architecture and database pages |

### What was not made by AI

| Item | Source |
| --- | --- |
| UI design | The team's own Figma file "AI-Sleep_Designathon" (the Designathon round). The web app's design tokens are taken from it |
| Competition data | The CSVs in `data/` are provided by the organisers. The seed only loads them |
| Product decisions | The rules (capacity blocks publishing, a vehicle runs at most two trips a day, the 16:00 order cutoff, LIFO loading and so on) come from the competition booklet and team decisions |
| Map data | Sri Lanka PMTiles, fonts and district shapes are open map data, not generated |

The landing and sign-in images in `apps/web/public` were added with the Figma design tokens (Methuli's commits, no AI credit). The repository cannot show whether any image was made with an AI image tool, so members who added images should say so in their statement.

---

## 5. How AI-written work was checked

1. **A person is responsible for every commit.** Every commit is authored under a team member's own git account, including those an assistant helped write.
2. **Pull requests.** Work reaches `main` through pull requests: 83 merged so far.
3. **Automated checks on every pull request** (`.github/workflows/ci.yml`):
   - ESLint and TypeScript typecheck across the workspace
   - Unit tests: Vitest for `packages/domain` and the web app, Jest for the API
   - API end-to-end tests against a real, migrated and seeded Postgres 16
   - Docker image builds for the API and the web app
4. **Rules kept in one tested place.** Business rules live only in `packages/domain`, with unit tests, so generated UI or API code cannot quietly re-implement them differently.
5. **Docs checked against the code.** The architecture and database pages were checked against `schema.prisma`, the migrations and the services, and corrected where the first draft was wrong.

---

## 6. Team member statements

Each member confirms or corrects their own part.

### Hiruka: Sync Dock and Sync Store

- **Tool:** Claude Code (Claude Opus 5.5).
- **Used for:** the loader dock and store screens, their NestJS API routes (`loads`, `store`), the ERD writes for delivery notes and flags, the dock/store e2e tests, and checking progress against the build plan.
- **How:** code was written with the assistant and reviewed by Hiruka before each PR. Commits it helped with carry a `Co-Authored-By: Claude` line.

### Chamodhi: Documentation

- **Tool:** Claude Code (Claude Opus 5.5).
- **Used for:** [architecture.md](architecture.md), [database-structure.md](database-structure.md), this page, and keeping [data-model.md](data-model.md) in step with the dock sign-in change. The assistant read the codebase, the Prisma schema, the migrations, the git history and a database dump, and drafted the pages. The column tables in `database-structure.md` were generated by a script from `schema.prisma`, so they match the schema exactly. One earlier commit (Sehara's remaining live-day, breakdown and move-a-stop work) was also made with Claude Code.
- **How:** claims in the drafts were checked against the source, and wrong ones were corrected before saving. The figures on this page come from `git log` on 4 Oct 2026.

### Other members

Nithika, Methuli, Yohan, Sithil, Sehara, Sanaya and Kithnula: please add a short statement in the same format (tool, what it was used for, how it was checked), especially for any AI use the commit credit lines do not show.

---

## 7. Limits of this disclosure

- The figures come from commit credit lines, which are only as complete as each tool and person made them.
- Cursor commits do not record which model Cursor used.
- Squashed or rebased history can merge AI-assisted and manual work into one commit.
- Counts are for all branches on 4 Oct 2026 and will change as the team keeps committing. To recount:

```bash
git log --all --no-merges --format=%B | grep -iE "co-authored-by: (claude|cursor)" | sort | uniq -c
```
