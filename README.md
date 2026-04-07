# SF Pulse

SF Pulse is a TypeScript app for tracking San Francisco restaurant openings and local events. It serves Astro-rendered pages through the Node adapter, stores data in PostgreSQL, and can optionally publish realtime updates and browser push notifications.

## Stack

- Node.js 20+
- npm
- TypeScript
- Astro 6 + Node adapter
- PostgreSQL
- Optional Redis for multi-instance realtime fanout

## Repo layout

- `src/pages/`: Astro pages and API routes
- `src/scripts/`: browser-side progressive enhancement for the home page
- `server/`: storage, migrations, refresh logic, security, and realtime plumbing
- `shared/`: shared timeline/date/identity helpers used by server and browser code
- `bin/`: build, migration, cron refresh, and menu discovery scripts
- `migrations/`: plain SQL migrations
- `patches/`: local `patch-package` fixes used by the test and migration stack
- `render.yaml`: Render deployment definition
- `Dockerfile`: production container build

## Requirements

- Node.js 20 or newer
- npm
- A PostgreSQL database
- Redis only if you want cross-instance SSE/pubsub behavior locally
- VAPID keys only if you want to test browser push notifications locally

## Local setup

1. Install dependencies:

```sh
npm ci
```

`npm ci` runs `patch-package` after install. That is expected in this repo.

2. Start PostgreSQL and create a database for the app.

3. Create `.env.local` in the repo root. `.env.local` is gitignored and is the expected place for local secrets.

```dotenv
DATABASE_URL=postgres://<user>:<password>@127.0.0.1:5432/<database>

# Optional local overrides
HOST=127.0.0.1
PORT=5000
APP_URL=http://127.0.0.1:5000

# Required if you want to test push notifications locally
VAPID_PUBLIC_KEY=<public-key>
VAPID_PRIVATE_KEY=<private-key>

# Required for protected delete endpoints and for production parity
CRON_SECRET=<random-secret>

# Optional: only needed for multi-instance realtime fanout
REDIS_URL=redis://127.0.0.1:6379
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

## First data load

A fresh database starts empty. If you want real app data locally, run the refresh job once after migrating:

```sh
node --env-file=.env.local --import tsx bin/cron-refresh.ts
```

That job fetches restaurant and event candidates, writes new items to Postgres, and then attempts menu discovery for restaurants that still need it.

If you only want to rerun menu discovery against existing restaurant rows:

```sh
node --env-file=.env.local --import tsx bin/seed-menus.ts
```

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
| `NODE_ENV` | Set by scripts/runtime | `development`, `test`, or `production`. |

To generate VAPID keys locally:

```sh
npx web-push generate-vapid-keys
```

## Scripts

- `npm run dev`: start the app in development mode with Astro and `.env.local`
- `npm run migrate`: apply SQL migrations from `migrations/`
- `npm run build`: build the Astro app, server bundle, cron bundle, and copy migrations into `dist/`
- `npm start`: start the production server from `dist/server/entry.mjs`
- `npm run typecheck`: run TypeScript checks for app and test configs
- `npm test`: run the Node test suite

## Development notes

- There is a single Astro/Node process in local dev. You do not run a separate frontend dev server.
- Tests mostly use `pg-mem`, so `npm test` does not need a real `DATABASE_URL`.
- The repo carries local patches for `pg-mem` and `pgsql-ast-parser`. If SQL-related tests start failing unexpectedly, check `patches/` and `docs/pg-mem-upstreaming.md`.
- Protected delete routes expect `x-cron-secret` to match `CRON_SECRET`.
- Browser push is optional. If VAPID keys are missing, the main app still runs, but push endpoints and subscription flows will not.

## API surface

- `GET /api/restaurants`
- `GET /api/events`
- `GET /api/updates`
- `GET /api/updates/last-updated`
- `GET /api/healthz`
- `GET /api/events-stream`
- `GET /api/rss.xml`
- `GET /api/push/vapid-key`
- `POST /api/push/subscribe`
- `POST /api/push/unsubscribe`

## Production

- Render deployment is defined in `render.yaml`.
- The Render web service builds the app, runs migrations before deploy, and starts `dist/server/entry.mjs`.
- A separate Render cron service runs the refresh job on a schedule.
- `Dockerfile` provides a production image based on `node:22-slim`.

For production, supply environment variables through the host platform. Do not rely on `.env.local` outside local development.
