# AGENTS.md

- PostgreSQL is the source of truth in this repo. Never rewrite application SQL or behavior to work around `pg-mem` limitations.
- If valid PostgreSQL fails in `pg-mem`, patch `pg-mem` with `patch-package`, add a focused regression test, and update [patches/README.md](/Users/joeybaker/Code/sf-pulse/patches/README.md) plus [docs/pg-mem-upstreaming.md](/Users/joeybaker/Code/sf-pulse/docs/pg-mem-upstreaming.md).

## What this is

SF Pulse is a TypeScript PWA that tracks San Francisco restaurant openings and local events. Built with Astro 6 + Node adapter, PostgreSQL, optional Redis for realtime fanout, and web push notifications.

## Commands

```bash
npm run dev          # Dev server at http://127.0.0.1:5000 (loads .env.local)
npm test             # Node native test runner with pg-mem (no real DB needed)
npm run typecheck    # Astro check + tsc for test files
npm run build        # Astro site + esbuild server bundles → dist/
npm run migrate      # Apply SQL migrations (needs DATABASE_URL in .env.local)

# Run a single test file
node --import tsx/esm --test server/storage.test.ts

# Run migration tests only (useful when editing migrations or pg-mem patches)
node --import tsx/esm --test server/migrate.test.ts

# First data load (fetches from sources into local DB)
node --env-file=.env.local --import tsx bin/cron-refresh.ts
```

## Architecture

**Rendering:** Astro SSR generates initial HTML; `src/scripts/home.ts` progressively enhances with SSE realtime updates, push subscription UI, and client-side filter state.

**Shared code:** `shared/` contains isomorphic modules (types, date parsing, filters, rendering, catalog) used by both server and browser. Aliased as `@shared` in Astro/Vite and `@shared/*` in tsconfig paths.

**API handler abstraction:** `src/server/api/` contains request handlers shared between Astro API routes (`src/pages/api/`) and the standalone test HTTP server (`server/app.ts`). This avoids duplicating route logic.

**Data flow:** Two-phase pipeline: Phase 1 fetches raw content from sources (Eater SF, SFist, Michelin, FunCheap, FAMSF, Cal Academy, DuckDuckGo). Phase 2 extracts structured data — via LLM (when `LLM_API_KEY` is set) or regex fallback (SFist, Michelin always use regex). Results merge → dedup → `server/refresh.ts` orchestrates upsert via `server/storage.ts` → broadcasts SSE deltas → sends personalized push notifications.

**LLM extraction:** `server/llm/` provides a provider-agnostic structured extraction layer (OpenAI or Anthropic). Zod schemas define the extraction format. Graceful degradation: if `LLM_API_KEY` is not set, only regex-based sources (SFist, Michelin) produce results. Tests use a mock LLM client — no API keys needed.

**Realtime:** `server/sse.ts` uses in-process broadcast when REDIS_URL is absent, Redis pub/sub when present. Client receives versioned delta events (upserted/deleted arrays), not full refreshes.

**Database:** PostgreSQL via `pg`. Connection pool singleton in `server/db.ts`. Plain SQL migrations in `migrations/` tracked by `schema_migrations` table. All queries use parameterized statements.

## PostgreSQL-first testing

The repo carries 9 pg-mem patches and 2 pgsql-ast-parser patches (see `patches/README.md`). These are auto-applied via `postinstall`. When adding new patches:
1. Add a regression test in `server/pg-mem.test.ts` or `server/pgsql-ast-parser.test.ts`
2. Regenerate with `npx patch-package pg-mem pgsql-ast-parser`
3. Update `patches/README.md` and `docs/pg-mem-upstreaming.md`

Test DB setup uses `server/test-helpers.ts` → `createTestDb()` which runs all migrations against pg-mem.

## Migrations

Plain SQL files in `migrations/` with numeric prefixes (0001–0010). Must be:
- **Idempotent:** use `IF NOT EXISTS`, `ON CONFLICT`, `WHERE NOT EXISTS` guards
- **Transactional:** each file runs in a single transaction
- **Standard PostgreSQL:** no pg-mem workarounds in migration SQL

Run `node --import tsx/esm --test server/migrate.test.ts` before the full suite when editing migrations.

## Code conventions

**Tests are mandatory.** Every feature, bug fix, or behavior change must include or update tests. Run `npm test` and `npm run typecheck` to verify before considering work complete.

**Docs stay current.** When adding or changing features, update the relevant docs:
- `README.md` — user-facing setup, API surface, scripts, environment variables
- `AGENTS.md` — architecture, conventions, and agent guidance
- `patches/README.md` and `docs/pg-mem-upstreaming.md` — when adding pg-mem/pgsql-ast-parser patches

**Prettier config** (in package.json): no semicolons, trailing commas, single quotes.

**Logging:** `console.info` for lifecycle output, `console.warn` for degraded states, `console.error` for failures. `console.log` is for temporary debugging only. Use stable prefixes like `[cron]`, `[migrate]`.

**Security:** Mutation endpoints require `x-cron-secret` header matching `CRON_SECRET`. Input validation uses Zod schemas in `server/security.ts`. Push endpoints validate trusted provider domains (FCM, Mozilla, Apple, Windows).

**Storage layer:** `server/storage.ts` accepts optional pool injection for testing. Uses `ON CONFLICT` for idempotent upserts. Restaurant identity keys and event dedupe keys prevent duplicates.

## Environment

Requires Node.js >=22.12.0. Local secrets go in `.env.local` (gitignored). Only `DATABASE_URL` is required for the app; tests run without any env vars. See README.md for the full env var table.

Optional LLM env vars for enhanced extraction: `LLM_API_KEY` (API key for OpenAI or Anthropic), `LLM_PROVIDER` (default: `openai`), `LLM_MODEL` (default: `gpt-4o-mini`). Without these, the pipeline runs with regex-only extraction.

## Deployment

Render.com via `render.yaml`: web service + PostgreSQL + Redis + daily cron trigger. Pre-deploy runs migrations. Build produces `dist/server/entry.mjs` (web), `dist/bin/migrate.cjs`, `dist/bin/cron.cjs`, `dist/bin/workflow.cjs`, `dist/bin/trigger-workflow.cjs`. The workflow worker is configured separately in the Render Dashboard.

## Workflows

The daily scraping pipeline runs as Render Workflow tasks defined in `bin/workflow/`. Each external source (Eater SF, SFist, Michelin, Funcheap, FAMSF, Cal Academy, DuckDuckGo) is a separate task with its own retry policy and timeout.

The `daily-refresh` orchestrator task in `bin/workflow/daily-refresh.ts` calls source tasks via `Promise.allSettled`, deduplicates, persists via `applyDiscoveredItems`, and runs menu discovery.

Task wrappers are thin — all scraping logic lives in `bin/cron-refresh/`. For local dev, use `bin/cron-refresh.ts` directly (no workflow runtime needed).

The cron service (`sf-pulse-daily`) triggers the workflow via the Render SDK API. The workflow worker (`sf-pulse-workflow`) runs the task server.
