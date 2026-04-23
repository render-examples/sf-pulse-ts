# Convert Cron Scraping to Render Workflows

## Summary

Decompose the monolithic `bin/cron-refresh.ts` cron job into fine-grained Render Workflow tasks. Each external data source becomes its own task with independent retries, timeouts, and dashboard visibility. A lightweight cron service triggers the workflow via the Render API.

All existing scraping logic in `bin/cron-refresh/` stays unchanged. The workflow tasks are thin wrappers.

## Task Inventory

### Source tasks

| Task | Wraps | Returns | Retries | Timeout |
|------|-------|---------|---------|---------|
| `fetch-eater-sf` | `fetchEaterSF()` | `NewRestaurant[]` | 3x, 2s backoff | 120s |
| `fetch-sfist` | `fetchSFist()` | `NewRestaurant[]` | 3x, 2s backoff | 60s |
| `fetch-michelin` | `fetchMichelinCaliforniaSelection()` | `NewRestaurant[]` | 2x, 5s backoff | 120s |
| `search-restaurants` | `searchWeb()` for restaurants | `NewRestaurant[]` | 2x, 3s backoff | 60s |
| `fetch-funcheap` | `fetchFuncheap()` | `NewEvent[]` | 3x, 2s backoff | 120s |
| `fetch-famsf` | `fetchFAMSF()` | `NewEvent[]` | 3x, 2s backoff | 60s |
| `fetch-cal-academy` | `fetchCalAcademy()` | `NewEvent[]` | 3x, 2s backoff | 60s |
| `search-events` | `searchWeb()` for events | `NewEvent[]` | 2x, 3s backoff | 60s |

### Pipeline tasks

| Task | Input | Returns |
|------|-------|---------|
| `apply-discovered-items` | `{ restaurants, events }` | `{ added, updated }` summary |
| `discover-menus` | (none, queries DB) | `{ checked, found }` |
| `daily-refresh` (orchestrator) | (none) | Overall summary |

### Data flow

```
daily-refresh
  |-- fetch-eater-sf --------\
  |-- fetch-sfist ------------+
  |-- fetch-michelin ---------+-> restaurants[]
  |-- search-restaurants -----/
  |-- fetch-funcheap ---------\
  |-- fetch-famsf ------------+-> events[]
  |-- fetch-cal-academy ------+
  |-- search-events ----------/
  |-- apply-discovered-items(restaurants, events)
  \-- discover-menus()
```

## File Structure

### New files

```
bin/
  trigger-workflow.ts          # Cron service entry: calls workflow via Render SDK
  workflow.ts                  # Workflow entry: imports all tasks, starts server
  workflow/
    fetch-eater-sf.ts
    fetch-sfist.ts
    fetch-michelin.ts
    search-restaurants.ts
    fetch-funcheap.ts
    fetch-famsf.ts
    fetch-cal-academy.ts
    search-events.ts
    apply-discovered-items.ts
    discover-menus.ts
    daily-refresh.ts
```

### Unchanged

- `bin/cron-refresh/` — all scraping functions stay as-is
- `server/refresh.ts` — `applyDiscoveredItems` keeps its current signature
- `server/storage.ts` — no changes

### Modified

- `render.yaml` — new workflow worker service, cron service becomes lightweight trigger
- `bin/build.ts` — add esbuild entry points for `trigger-workflow.ts` and `workflow.ts`

## Task Wrapper Pattern

Each source task wraps the existing function:

```typescript
import { task } from '@renderinc/sdk/workflows'
import { fetchEaterSF } from '../cron-refresh/restaurants.js'
import type { NewRestaurant } from '../../server/storage.js'

export const fetchEaterSfTask = task(
  {
    name: 'fetch-eater-sf',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 120,
  },
  async function fetchEaterSf(): Promise<NewRestaurant[]> {
    return fetchEaterSF([])
  },
)
```

## Orchestrator

The `daily-refresh` task calls all source tasks via `Promise.allSettled`, deduplicates, persists, then runs menu discovery. It reuses the existing `settled()` helper from `bin/cron-refresh/run.ts` and the dedup-by-name/identity-key logic from the same file:

```typescript
import { task } from '@renderinc/sdk/workflows'
import { settled } from '../cron-refresh/run.js'
// ... import all task references

export const dailyRefreshTask = task(
  { name: 'daily-refresh', timeoutSeconds: 600 },
  async function dailyRefresh() {
    // Phase 1: Restaurant discovery
    const [eater, sfist, michelin, ddgR] = await Promise.allSettled([
      fetchEaterSfTask(),
      fetchSfistTask(),
      fetchMichelinTask(),
      searchRestaurantsTask(),
    ])
    const restaurants = dedup([
      ...settled(eater, 'Eater SF', []),
      ...settled(sfist, 'SFist', []),
      ...settled(michelin, 'Michelin', []),
      ...settled(ddgR, 'DDG restaurants', []),
    ])

    // Phase 2: Event discovery
    const [funcheap, famsf, calAcademy, ddgE] = await Promise.allSettled([
      fetchFuncheapTask(),
      fetchFamsfTask(),
      fetchCalAcademyTask(),
      searchEventsTask(),
    ])
    const events = dedup([
      ...settled(funcheap, 'Funcheap', []),
      ...settled(famsf, 'FAMSF', []),
      ...settled(calAcademy, 'Cal Academy', []),
      ...settled(ddgE, 'DDG events', []),
    ])

    // Phase 3: Persist & notify
    if (restaurants.length || events.length) {
      await applyDiscoveredItemsTask({ restaurants, events })
    }

    // Phase 4: Menu discovery
    await discoverMenusTask()

    return { restaurants: restaurants.length, events: events.length }
  },
)
```

## Michelin Rate-Limiting

The `fetch-michelin` task checks `cron_runs` internally. If not due (< 3 days since last run), it returns `[]` without error. Retries only apply to actual failures.

## Error Handling

Mirrors the existing `settled()` pattern:
- Source task fails after retries → orchestrator logs warning, contributes `[]`
- All sources fail → orchestrator logs "nothing new", skips persist
- DB failure in `apply-discovered-items` → orchestrator fails (task run shows error)
- Individual menu check fails → `discover-menus` logs warning, continues to next

## Render Infrastructure

### New: Workflow worker service

```yaml
- type: worker
  name: sf-pulse-workflow
  runtime: node
  plan: starter
  buildCommand: npm ci --include=dev && npm run build
  startCommand: node dist/bin/workflow.cjs
  envVars:
    - key: DATABASE_URL
      fromDatabase:
        name: sf-pulse-db
        property: connectionString
    - key: REDIS_URL
      fromService:
        name: sf-pulse-realtime
        type: keyvalue
        property: connectionString
    - key: VAPID_PUBLIC_KEY
      sync: false
    - key: VAPID_PRIVATE_KEY
      sync: false
    - key: CRON_SECRET
      sync: false
```

### Changed: Cron service (lightweight trigger)

```yaml
- type: cron
  name: sf-pulse-daily
  schedule: "0 14 * * *"
  buildCommand: npm ci --include=dev && npm run build
  startCommand: node dist/bin/trigger-workflow.cjs
  envVars:
    - key: RENDER_API_KEY
      sync: false
    - key: SF_PULSE_WORKFLOW_SLUG
      sync: false
```

Env vars removed from cron service: `DATABASE_URL`, `REDIS_URL`, `VAPID_*`, `CRON_SECRET`.

### trigger-workflow.ts

```typescript
import { Render } from '@renderinc/sdk'

const render = new Render({ token: process.env.RENDER_API_KEY })
const slug = process.env.SF_PULSE_WORKFLOW_SLUG

const result = await render.workflows.runTask(`${slug}/daily-refresh`, [])
console.info('[cron] workflow completed:', result.results)
```

### New env vars

| Variable | Service | Purpose |
|----------|---------|---------|
| `RENDER_API_KEY` | cron | Authenticate workflow API calls |
| `SF_PULSE_WORKFLOW_SLUG` | cron | Workflow identifier for API calls |

## Build Changes

`bin/build.ts` adds two esbuild entry points with the same config as `cron.cjs`:

- `bin/trigger-workflow.ts` → `dist/bin/trigger-workflow.cjs`
- `bin/workflow.ts` → `dist/bin/workflow.cjs`

## Local Development

`bin/cron-refresh.ts` continues to work for local dev. The workflow is a deployment concern — no Render runtime needed locally.
