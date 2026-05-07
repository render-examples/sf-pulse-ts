# SF Pulse

SF Pulse is a TypeScript app for tracking San Francisco restaurant openings and local events. It serves Astro-rendered pages through the Node adapter, stores data in PostgreSQL, and can optionally publish realtime updates and browser push notifications.

## Deploy to Render

### Overview

Render deployment is defined in `render.yaml`:

- **Web** (`sf-pulse`): builds the app, runs migrations pre-deploy, starts `dist/server/entry.mjs`. Health check at `/api/healthz`.
- **Cron** (`sf-pulse-daily`): runs daily at 7 AM PDT. Executes `dist/bin/trigger-workflow.cjs` to trigger the daily-refresh Render Workflow via the SDK API.
- **Database** (`sf-pulse-db`): PostgreSQL.
- **Key-value** (`sf-pulse-realtime`): Redis for cross-instance SSE fanout.

The workflow service (`sf-pulse-workflow`) must be created manually in the Render Dashboard as a **Workflow** — Render Workflows are not supported in Blueprint YAML. See below for instructions.

`Dockerfile` provides a production image based on `node:22-slim`.

For production, supply environment variables through the host platform. Do not rely on `.env.local` outside local development.

### Step 1: Create the `sf-pulse-env` env group

Before deploying the Blueprint, create a Render env group that all services will share.

Dashboard → **Env Groups** → **New Env Group** → name it `sf-pulse-env`.

Add the following variables:

| Variable | Value |
| --- | --- |
| `CRON_SECRET` | Generate with `openssl rand -hex 32` |
| `HOST` | `0.0.0.0` |
| `NODE_ENV` | `production` |
| `LLM_API_KEY` | Your OpenAI or Anthropic API key |
| `LLM_PROVIDER` | _(optional)_ `openai` or `anthropic` — inferred from the key if omitted |
| `LLM_MODEL` | _(optional)_ model override |
| `DATABASE_URL` | Leave empty for now — fill in after step 3 |
| `REDIS_URL` | Leave empty for now — fill in after step 3 |
| `VAPID_PUBLIC_KEY` | _(optional)_ required only for push notifications |
| `VAPID_PRIVATE_KEY` | _(optional)_ required only for push notifications |

### Step 2: Create the workflow service manually

Render Workflows are not supported in Blueprint YAML, so `sf-pulse-workflow` must be created by hand in the Dashboard.

1. Dashboard → **New** → **Workflow** → connect the repo, branch `main`.
2. Set **Name** to `sf-pulse-workflow`.
3. Set **Build Command** to `npm ci --include=dev && npm run build`.
4. Set **Start Command** to `node dist/bin/workflow.cjs`.
5. Set **Plan** to Starter.
6. Under **Environment**, add the `sf-pulse-env` env group.
7. Save and deploy. Once it's live, go to **Settings** and note the **Slug** — you'll need it for `SF_PULSE_WORKFLOW_SLUG` in step 3.

### Step 3: Deploy the Blueprint

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Frender-examples%2Fsf-pulse-ts)

This Blueprint creates four services from `render.yaml`: web, cron trigger, PostgreSQL, and Redis. All services pull shared config from the `sf-pulse-env` env group created in step 1.

Once the Blueprint deploys:

1. Copy the `DATABASE_URL` from the `sf-pulse-db` database and the `REDIS_URL` from the `sf-pulse-realtime` key-value store, and set them in the `sf-pulse-env` env group.
2. Set these two env vars on the `sf-pulse-daily` cron service:

| Variable | How to get it |
| --- | --- |
| `RENDER_API_KEY` | Dashboard → Account Settings → API Keys → Create API Key |
| `SF_PULSE_WORKFLOW_SLUG` | The slug from `sf-pulse-workflow` Settings (step 2) |

### Verify (optional)

To confirm the pipeline works before the first scheduled cron fires at 7 AM PDT:

1. Go to `sf-pulse-daily` in the Dashboard → **Trigger Run**.
2. Check `sf-pulse-workflow` logs for task execution output.
3. Ensure the `sf-pulse` web service frontend URL is displauying restaurant information as expected.

## Stack

- Node.js >=22.12.0
- npm
- TypeScript
- Astro 6 + Node adapter
- PostgreSQL
- Optional Redis for multi-instance realtime fanout
- Render Workflows (`@renderinc/sdk`) for the daily scraping pipeline

## Repo layout

- `src/pages/`: Astro pages and API routes
- `src/scripts/`: browser-side progressive enhancement for the home page
- `src/server/api/`: request handlers shared between Astro routes and the test HTTP server
- `server/`: storage, migrations, refresh logic, security, and realtime plumbing
- `shared/`: isomorphic timeline/date/identity/filter helpers used by server and browser
- `client/`: client-side date and timeline library
- `bin/cron-refresh/`: source scrapers (Eater SF, SFist, Michelin, FunCheap, FAMSF, Cal Academy)
- `bin/workflow/`: Render Workflow task definitions for the daily scraping pipeline
- `bin/`: build, migration, cron trigger, and workflow entry scripts
- `migrations/`: plain SQL migrations (0001–0010)
- `patches/`: local `patch-package` fixes for pg-mem and pgsql-ast-parser
- `render.yaml`: Render deployment definition
- `Dockerfile`: production container build

## Requirements

- Node.js 22.12.0 or newer
- npm
- A PostgreSQL database
- VAPID keys
- Redis only if you want cross-instance SSE/pubsub behavior locally

## Local run

### Setup

1. Install dependencies:

```sh
npm ci
```

`npm ci` runs `patch-package` after install. That is expected in this repo.

2. Start PostgreSQL and create a database for the app:

```bash
brew install postgresql@14
brew services start postgresql@14
createdb sf_pulse_db
```

3. Create `.env.local` in the repo root. `.env.local` is gitignored and is the expected place for local secrets.

To generate VAPID keys locally:

```sh
npx web-push generate-vapid-keys
```

The full `.env.local` file should look like this.

```dotenv
DATABASE_URL=postgres://localhost/sf_pulse_db

# Optional local overrides
HOST=127.0.0.1
PORT=5000
APP_URL=http://127.0.0.1:5000

# Required
VAPID_PUBLIC_KEY=<public-key>
VAPID_PRIVATE_KEY=<private-key>

# Required for protected delete endpoints and for production parity
CRON_SECRET=<random-secret>

# Optional: only needed for multi-instance realtime fanout
REDIS_URL=redis://127.0.0.1:6379

# Required for menu and article parsing (see docs/openai-api-permissions.md)
OPENAI_API_KEY=
```

4. Run migrations:

```sh
npm run migrate
```

5. Start the dev server:

```sh
npm run dev
```

6. Open `http://127.0.0.1:5000`.

### First data load

A fresh database starts empty. If you want real app data locally, run the refresh job once after migrating:

```sh
node --env-file=.env.local --import tsx bin/cron-refresh.ts
```

That job fetches restaurant and event candidates, writes new items to Postgres, and then attempts menu discovery for restaurants that still need it.

If you only want to rerun menu discovery against existing restaurant rows:

```sh
node --env-file=.env.local --import tsx bin/seed-menus.ts
```
### Run workflow locally

1. In one terminal, run:

```bash
render workflows dev -- npx tsx --env-file=.env.local bin/workflow.ts 
```

2. In a second terminal, run:

```bash
render workflows tasks list --local
```

3. Select `daily-refresh`

4. Select `run`

5. Enter `[`] as input

That's it! Watch your workflow run


## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. The app will throw on first DB use if this is missing. |
| `HOST` | No | HTTP bind host. Defaults to `0.0.0.0`; `127.0.0.1` is fine for local dev. |
| `PORT` | No | HTTP port. Defaults to `5000`. |
| `APP_URL` | No in dev, yes in production unless `RENDER_EXTERNAL_URL` is present | Public base URL used by RSS and other externally visible links. |
| `RENDER_EXTERNAL_URL` | Render only | Production fallback for the public base URL when `APP_URL` is not set. |
| `VAPID_PUBLIC_KEY` | Only for push notifications | Public web-push key exposed to the browser. |
| `VAPID_PRIVATE_KEY` | Only for push notifications | Private web-push key used on the server. |
| `CRON_SECRET` | Recommended locally, required in production | Protects mutation endpoints that require the `x-cron-secret` header. |
| `REDIS_URL` | No | Enables Redis-backed pub/sub for realtime fanout across instances. Without it, realtime stays in-process. |
| `OPENAI_API_KEY` | Yes (for cron/workflow) | Enables AI-powered dietary flag extraction and article parsing. Required when running the cron pipeline. See `docs/openai-api-permissions.md`. |
| `NODE_ENV` | Set by scripts/runtime | `development`, `test`, or `production`. |
| `RENDER_API_KEY` | Cron service only | Render API token used by the cron trigger to start workflows. |
| `SF_PULSE_WORKFLOW_SLUG` | Cron service only | Render Workflow slug used to identify the daily-refresh workflow. |
| `LLM_API_KEY` | No | API key for OpenAI or Anthropic. Enables LLM-based structured extraction from articles and menus. Without it, only regex-based sources (SFist, Michelin) produce results. |
| `LLM_PROVIDER` | No | `openai` (default) or `anthropic`. |
| `LLM_MODEL` | No | Model override. Defaults to `gpt-4o-mini` (OpenAI) or `claude-sonnet-4-20250514` (Anthropic). |

To generate VAPID keys locally:

```sh
npx web-push generate-vapid-keys
```

## Scripts

- `npm run dev`: start the app in development mode with Astro and `.env.local`
- `npm run migrate`: apply SQL migrations from `migrations/`
- `npm run build`: build the Astro app + esbuild server bundles (migrate, cron, workflow, trigger-workflow) into `dist/`
- `npm start`: start the production server from `dist/server/entry.mjs`
- `npm run typecheck`: run TypeScript checks for app and test configs
- `npm test`: run the Node test suite (uses pg-mem, no real DB needed)

## Development notes

- There is a single Astro/Node process in local dev. You do not run a separate frontend dev server.
- Tests mostly use `pg-mem`, so `npm test` does not need a real `DATABASE_URL`.
- The repo carries local patches for `pg-mem` and `pgsql-ast-parser`. If SQL-related tests start failing unexpectedly, check `patches/` and `docs/pg-mem-upstreaming.md`.
- Protected delete routes expect `x-cron-secret` to match `CRON_SECRET`.
- Browser push is optional. If VAPID keys are missing, the main app still runs, but push endpoints and subscription flows will not.

## API surface

- `GET /api/restaurants` — list restaurants
- `DELETE /api/restaurants/:id` — delete a restaurant (requires `x-cron-secret`)
- `GET /api/events` — list events
- `DELETE /api/events/:id` — delete an event (requires `x-cron-secret`)
- `GET /api/updates` — recent items
- `GET /api/updates/last-updated` — last-updated timestamp
- `GET /api/healthz` — health check
- `GET /api/events-stream` — SSE realtime stream
- `GET /api/rss.xml` — RSS feed
- `GET /api/push/vapid-key` — VAPID public key
- `POST /api/push/subscribe` — register push subscription
- `POST /api/push/unsubscribe` — remove push subscription
- `GET /api/push/subscription` — check subscription status
- `POST /api/push/preferences` — update notification preferences