# Render Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the monolithic cron scraping job into fine-grained Render Workflow tasks with per-source retries, dashboard visibility, and on-demand triggering.

**Architecture:** Thin wrapper tasks in `bin/workflow/` call existing scraping functions from `bin/cron-refresh/`. An orchestrator task coordinates source tasks via `Promise.allSettled`, deduplicates, persists via `applyDiscoveredItems`, and runs menu discovery. A lightweight cron trigger calls the workflow via the Render SDK API.

**Tech Stack:** `@renderinc/sdk` (already installed), `task()` and `startTaskServer()` from `@renderinc/sdk/workflows`, `Render` client from `@renderinc/sdk`

**Spec:** `docs/superpowers/specs/2026-04-22-render-workflows-design.md`

---

### Task 1: Export `settled` and dedup helpers from `bin/cron-refresh/run.ts`

The `settled()` helper and the restaurant/event dedup logic are currently private to `main()`. The workflow orchestrator needs to import them.

**Files:**
- Modify: `bin/cron-refresh/run.ts:30-38` (export `settled`)
- Modify: `bin/cron-refresh/run.ts` (extract dedup logic into exported functions)
- Create: `bin/cron-refresh/run.test.ts`
- Modify: `bin/cron-refresh.ts` (re-export new helpers)

- [ ] **Step 1: Write tests for `settled` helper**

Create `bin/cron-refresh/run.test.ts`:

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { settled, dedupRestaurants, dedupEvents } from './run.js'
import type { NewRestaurant, NewEvent } from './types.js'

describe('settled', () => {
  it('returns the value for a fulfilled result', () => {
    const result: PromiseSettledResult<string[]> = {
      status: 'fulfilled',
      value: ['a', 'b'],
    }
    assert.deepStrictEqual(settled(result, 'test', []), ['a', 'b'])
  })

  it('returns fallback for a rejected result', () => {
    const result: PromiseSettledResult<string[]> = {
      status: 'rejected',
      reason: new Error('fail'),
    }
    assert.deepStrictEqual(settled(result, 'test', ['fallback']), ['fallback'])
  })
})

describe('dedupRestaurants', () => {
  it('deduplicates by lowercased name', () => {
    const items: NewRestaurant[] = [
      {
        name: 'Benu',
        neighborhood: 'SoMa',
        cuisine: 'New opening',
        address: null,
        opened_date: 'April 2026',
        source_url: null,
      },
      {
        name: 'benu',
        neighborhood: 'South of Market',
        cuisine: 'Californian',
        address: null,
        opened_date: 'April 2026',
        source_url: null,
      },
    ]
    const result = dedupRestaurants(items)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].name, 'Benu')
  })
})

describe('dedupEvents', () => {
  it('deduplicates by identity key', () => {
    const items: NewEvent[] = [
      {
        title: 'Jazz in the Park',
        location: 'Golden Gate Park',
        date: 'April 25, 2026',
        time: '7pm',
        description: null,
        source_url: null,
      },
      {
        title: 'Jazz in the Park',
        location: 'Golden Gate Park',
        date: 'April 25, 2026',
        time: '7:00 PM',
        description: 'Great jazz',
        source_url: null,
      },
    ]
    const result = dedupEvents(items)
    assert.strictEqual(result.length, 1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx/esm --test bin/cron-refresh/run.test.ts`
Expected: FAIL — `settled`, `dedupRestaurants`, `dedupEvents` are not exported.

- [ ] **Step 3: Extract and export `settled`, `dedupRestaurants`, `dedupEvents`**

In `bin/cron-refresh/run.ts`, change `settled` from a private function to an exported function (line 30):

```typescript
export function settled<T>(
```

Add two new exported functions after `isCronJobDue` (after line 49):

```typescript
export function dedupRestaurants(items: NewRestaurant[]): NewRestaurant[] {
  const seen = new Set<string>()
  const result: NewRestaurant[] = []
  for (const restaurant of items) {
    const key = restaurant.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(restaurant)
  }
  return result
}

export function dedupEvents(items: NewEvent[]): NewEvent[] {
  const seen = new Set<string>()
  const result: NewEvent[] = []
  for (const event of items) {
    const normalizedDate = normalizeDateText(event.date)
    const key = buildEventIdentityKey({
      title: event.title,
      location: event.location,
      dateText: normalizedDate,
    })
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      ...event,
      date: normalizedDate,
    })
  }
  return result
}
```

Then update `main()` to use the new functions. Replace the inline restaurant dedup loop (lines 73-80):

```typescript
  const newRestaurants = dedupRestaurants([
    ...eaterItems,
    ...sfistItems,
    ...ddgRestaurants,
  ])
```

Replace the inline event dedup loop (lines 122-142):

```typescript
  const newEvents = dedupEvents([
    ...funcheapItems,
    ...famsfItems,
    ...calAcademyItems,
    ...ddgEvents,
  ])
```

For the Michelin dedup inside `main()` (lines 87-93), change to use the same pattern — push into the array before dedup, or check against the deduped list:

```typescript
      for (const restaurant of michelinItems) {
        const key = restaurant.name.toLowerCase()
        if (newRestaurants.some((c) => c.name.toLowerCase() === key)) continue
        newRestaurants.push(restaurant)
      }
```

This part stays inline since `newRestaurants` is mutated after initial dedup. The Michelin items are appended after the first dedup pass, which is correct — they arrive later in the pipeline.

- [ ] **Step 4: Re-export from `bin/cron-refresh.ts`**

Add to the exports in `bin/cron-refresh.ts`:

```typescript
export { settled, isCronJobDue, dedupRestaurants, dedupEvents } from './cron-refresh/run.js'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import tsx/esm --test bin/cron-refresh/run.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass (no regressions from refactoring `main()`).

- [ ] **Step 7: Commit**

```bash
git add bin/cron-refresh/run.ts bin/cron-refresh/run.test.ts bin/cron-refresh.ts
git commit -m "refactor: export settled and dedup helpers for workflow reuse"
```

---

### Task 2: Create source task wrappers

Each source scraper gets a workflow task wrapper. These are thin: call the existing function, return the result. The `task()` decorator adds retry and timeout config.

**Files:**
- Create: `bin/workflow/fetch-eater-sf.ts`
- Create: `bin/workflow/fetch-sfist.ts`
- Create: `bin/workflow/fetch-michelin.ts`
- Create: `bin/workflow/search-restaurants.ts`
- Create: `bin/workflow/fetch-funcheap.ts`
- Create: `bin/workflow/fetch-famsf.ts`
- Create: `bin/workflow/fetch-cal-academy.ts`
- Create: `bin/workflow/search-events.ts`

- [ ] **Step 1: Create `bin/workflow/fetch-eater-sf.ts`**

```typescript
import { task } from '@renderinc/sdk/workflows'
import { fetchEaterSF } from '../cron-refresh/restaurants.js'
import type { NewRestaurant } from '../cron-refresh/types.js'

export const fetchEaterSfTask = task(
  {
    name: 'fetch-eater-sf',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 120,
  },
  async function fetchEaterSf(): Promise<NewRestaurant[]> {
    console.info('[workflow] fetching Eater SF...')
    const items = await fetchEaterSF([])
    console.info(`[workflow] Eater SF: ${items.length} candidates`)
    return items
  },
)
```

- [ ] **Step 2: Create `bin/workflow/fetch-sfist.ts`**

```typescript
import { task } from '@renderinc/sdk/workflows'
import { fetchSFist } from '../cron-refresh/restaurants.js'
import type { NewRestaurant } from '../cron-refresh/types.js'

export const fetchSfistTask = task(
  {
    name: 'fetch-sfist',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function fetchSfist(): Promise<NewRestaurant[]> {
    console.info('[workflow] fetching SFist...')
    const items = await fetchSFist([])
    console.info(`[workflow] SFist: ${items.length} candidates`)
    return items
  },
)
```

- [ ] **Step 3: Create `bin/workflow/fetch-michelin.ts`**

This task includes the rate-limiting check internally:

```typescript
import { task } from '@renderinc/sdk/workflows'
import { fetchMichelinCaliforniaSelection } from '../cron-refresh/restaurants.js'
import { isCronJobDue } from '../cron-refresh/run.js'
import { getCronRun, markCronRun } from '../../server/storage.js'
import type { NewRestaurant } from '../cron-refresh/types.js'

const MICHELIN_CRON_JOB = 'michelin_california_selection'
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export const fetchMichelinTask = task(
  {
    name: 'fetch-michelin',
    retry: { maxRetries: 2, waitDurationMs: 5000, backoffScaling: 2 },
    timeoutSeconds: 120,
  },
  async function fetchMichelin(): Promise<NewRestaurant[]> {
    const run = await getCronRun(MICHELIN_CRON_JOB)
    if (!isCronJobDue(run?.last_ran_at, THREE_DAYS_MS)) {
      console.info('[workflow] michelin check not due, skipping')
      return []
    }
    console.info('[workflow] checking Michelin California selection...')
    const items = await fetchMichelinCaliforniaSelection()
    await markCronRun(MICHELIN_CRON_JOB)
    console.info(`[workflow] Michelin: ${items.length} candidates`)
    return items
  },
)
```

- [ ] **Step 4: Create `bin/workflow/search-restaurants.ts`**

```typescript
import { task } from '@renderinc/sdk/workflows'
import { searchWeb } from '../cron-refresh/http.js'
import { stripHtml } from '../cron-refresh/html.js'
import { extractRestaurants } from '../cron-refresh/restaurants.js'
import type { NewRestaurant } from '../cron-refresh/types.js'

export const searchRestaurantsTask = task(
  {
    name: 'search-restaurants',
    retry: { maxRetries: 2, waitDurationMs: 3000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function searchRestaurants(): Promise<NewRestaurant[]> {
    const monthYear = new Date().toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    })
    console.info('[workflow] searching DuckDuckGo for restaurants...')
    const html = await searchWeb(
      `new restaurant openings San Francisco ${monthYear}`,
    )
    const items = extractRestaurants(stripHtml(html), [])
    console.info(`[workflow] DDG restaurants: ${items.length} candidates`)
    return items
  },
)
```

- [ ] **Step 5: Create `bin/workflow/fetch-funcheap.ts`**

```typescript
import { task } from '@renderinc/sdk/workflows'
import { fetchFuncheap } from '../cron-refresh/events.js'
import type { NewEvent } from '../cron-refresh/types.js'

export const fetchFuncheapTask = task(
  {
    name: 'fetch-funcheap',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 120,
  },
  async function fetchFuncheap(): Promise<NewEvent[]> {
    console.info('[workflow] fetching Funcheap...')
    const items = await fetchFuncheap([])
    console.info(`[workflow] Funcheap: ${items.length} candidates`)
    return items
  },
)
```

- [ ] **Step 6: Create `bin/workflow/fetch-famsf.ts`**

```typescript
import { task } from '@renderinc/sdk/workflows'
import { fetchFAMSF } from '../cron-refresh/events.js'
import type { NewEvent } from '../cron-refresh/types.js'

export const fetchFamsfTask = task(
  {
    name: 'fetch-famsf',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function fetchFamsf(): Promise<NewEvent[]> {
    console.info('[workflow] fetching FAMSF...')
    const items = await fetchFAMSF([])
    console.info(`[workflow] FAMSF: ${items.length} candidates`)
    return items
  },
)
```

- [ ] **Step 7: Create `bin/workflow/fetch-cal-academy.ts`**

```typescript
import { task } from '@renderinc/sdk/workflows'
import { fetchCalAcademy } from '../cron-refresh/events.js'
import type { NewEvent } from '../cron-refresh/types.js'

export const fetchCalAcademyTask = task(
  {
    name: 'fetch-cal-academy',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function fetchCalAcademy(): Promise<NewEvent[]> {
    console.info('[workflow] fetching Cal Academy...')
    const items = await fetchCalAcademy([])
    console.info(`[workflow] Cal Academy: ${items.length} candidates`)
    return items
  },
)
```

- [ ] **Step 8: Create `bin/workflow/search-events.ts`**

```typescript
import { task } from '@renderinc/sdk/workflows'
import { searchWeb } from '../cron-refresh/http.js'
import { stripHtml } from '../cron-refresh/html.js'
import { extractEvents } from '../cron-refresh/events.js'
import type { NewEvent } from '../cron-refresh/types.js'

export const searchEventsTask = task(
  {
    name: 'search-events',
    retry: { maxRetries: 2, waitDurationMs: 3000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function searchEvents(): Promise<NewEvent[]> {
    const monthYear = new Date().toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    })
    console.info('[workflow] searching DuckDuckGo for events...')
    const html = await searchWeb(
      `San Francisco events Golden Gate Park concerts ${monthYear}`,
    )
    const items = extractEvents(stripHtml(html), [])
    console.info(`[workflow] DDG events: ${items.length} candidates`)
    return items
  },
)
```

- [ ] **Step 9: Commit**

```bash
git add bin/workflow/
git commit -m "feat: add workflow task wrappers for each scraping source"
```

---

### Task 3: Create pipeline tasks (`apply-discovered-items` and `discover-menus`)

**Files:**
- Create: `bin/workflow/apply-discovered-items.ts`
- Create: `bin/workflow/discover-menus.ts`

- [ ] **Step 1: Create `bin/workflow/apply-discovered-items.ts`**

```typescript
import { task } from '@renderinc/sdk/workflows'
import {
  applyDiscoveredItems,
  type ApplyDiscoveredItemsInput,
  type ApplyDiscoveredItemsResult,
} from '../../server/refresh.js'

export const applyDiscoveredItemsTask = task(
  {
    name: 'apply-discovered-items',
    retry: { maxRetries: 1, waitDurationMs: 5000 },
    timeoutSeconds: 120,
  },
  async function applyItems(
    input: ApplyDiscoveredItemsInput,
  ): Promise<ApplyDiscoveredItemsResult> {
    console.info(
      `[workflow] applying ${input.restaurants?.length ?? 0} restaurants, ${input.events?.length ?? 0} events`,
    )
    const result = await applyDiscoveredItems(input)
    console.info('[workflow] apply result:', result)
    return result
  },
)
```

- [ ] **Step 2: Create `bin/workflow/discover-menus.ts`**

```typescript
import { task } from '@renderinc/sdk/workflows'
import {
  getRestaurantsNeedingMenuCheck,
  updateRestaurantMenu,
} from '../../server/storage.js'
import { discoverMenu } from '../cron-refresh/menu.js'

export const discoverMenusTask = task(
  {
    name: 'discover-menus',
    retry: { maxRetries: 1, waitDurationMs: 5000 },
    timeoutSeconds: 300,
  },
  async function discoverMenus(): Promise<{ checked: number; found: number }> {
    const restaurants = await getRestaurantsNeedingMenuCheck()
    console.info(
      `[workflow] ${restaurants.length} restaurants need menu check`,
    )

    let found = 0
    for (const restaurant of restaurants) {
      try {
        console.info(`[workflow] checking menu for: ${restaurant.name}`)
        const { menuUrl, dietaryFlags } = await discoverMenu(restaurant.name)
        await updateRestaurantMenu(restaurant.id, menuUrl, dietaryFlags)
        if (menuUrl) found++
      } catch (error) {
        console.error(
          `[workflow] menu check failed for ${restaurant.name}:`,
          error,
        )
      }
    }

    console.info(
      `[workflow] menu discovery: checked ${restaurants.length}, found ${found}`,
    )
    return { checked: restaurants.length, found }
  },
)
```

- [ ] **Step 3: Commit**

```bash
git add bin/workflow/apply-discovered-items.ts bin/workflow/discover-menus.ts
git commit -m "feat: add workflow tasks for data persistence and menu discovery"
```

---

### Task 4: Create the orchestrator task (`daily-refresh`)

**Files:**
- Create: `bin/workflow/daily-refresh.ts`

- [ ] **Step 1: Create `bin/workflow/daily-refresh.ts`**

```typescript
import { task } from '@renderinc/sdk/workflows'
import { settled, dedupRestaurants, dedupEvents } from '../cron-refresh/run.js'
import type { NewRestaurant } from '../cron-refresh/types.js'
import { fetchEaterSfTask } from './fetch-eater-sf.js'
import { fetchSfistTask } from './fetch-sfist.js'
import { fetchMichelinTask } from './fetch-michelin.js'
import { searchRestaurantsTask } from './search-restaurants.js'
import { fetchFuncheapTask } from './fetch-funcheap.js'
import { fetchFamsfTask } from './fetch-famsf.js'
import { fetchCalAcademyTask } from './fetch-cal-academy.js'
import { searchEventsTask } from './search-events.js'
import { applyDiscoveredItemsTask } from './apply-discovered-items.js'
import { discoverMenusTask } from './discover-menus.js'

export const dailyRefreshTask = task(
  { name: 'daily-refresh', timeoutSeconds: 600 },
  async function dailyRefresh(): Promise<{
    restaurants: number
    events: number
    menus: { checked: number; found: number }
  }> {
    console.info(
      `[workflow] SF Pulse refresh — ${new Date().toISOString()}`,
    )

    // Phase 1: Restaurant discovery
    console.info('[workflow] fetching restaurant sources...')
    const [eater, sfist, michelin, ddgR] = await Promise.allSettled([
      fetchEaterSfTask(),
      fetchSfistTask(),
      fetchMichelinTask(),
      searchRestaurantsTask(),
    ])

    const restaurants = dedupRestaurants([
      ...settled(eater, 'Eater SF', [] as NewRestaurant[]),
      ...settled(sfist, 'SFist', [] as NewRestaurant[]),
      ...settled(michelin, 'Michelin', [] as NewRestaurant[]),
      ...settled(ddgR, 'DDG restaurants', [] as NewRestaurant[]),
    ])

    // Phase 2: Event discovery
    console.info('[workflow] fetching event sources...')
    const [funcheap, famsf, calAcademy, ddgE] = await Promise.allSettled([
      fetchFuncheapTask(),
      fetchFamsfTask(),
      fetchCalAcademyTask(),
      searchEventsTask(),
    ])

    const events = dedupEvents([
      ...settled(funcheap, 'Funcheap', []),
      ...settled(famsf, 'FAMSF', []),
      ...settled(calAcademy, 'Cal Academy', []),
      ...settled(ddgE, 'DDG events', []),
    ])

    console.info(
      `[workflow] candidates: ${restaurants.length} restaurants, ${events.length} events`,
    )

    // Phase 3: Persist & notify
    if (restaurants.length > 0 || events.length > 0) {
      await applyDiscoveredItemsTask({ restaurants, events })
    } else {
      console.info('[workflow] nothing new')
    }

    // Phase 4: Menu discovery
    console.info('[workflow] starting menu discovery...')
    const menus = await discoverMenusTask()

    return { restaurants: restaurants.length, events: events.length, menus }
  },
)
```

- [ ] **Step 2: Commit**

```bash
git add bin/workflow/daily-refresh.ts
git commit -m "feat: add daily-refresh orchestrator workflow task"
```

---

### Task 5: Create workflow entry point and cron trigger

**Files:**
- Create: `bin/workflow.ts`
- Create: `bin/trigger-workflow.ts`

- [ ] **Step 1: Create `bin/workflow.ts`**

This is the entry point for the Render workflow worker. It imports all task modules (which self-register via `task()`) and starts the task server:

```typescript
/**
 * Render Workflow entry — registers all tasks and starts the task server.
 *
 * Deploy as a Render worker service. Tasks are invoked by the Render
 * runtime when triggered via the SDK or dashboard.
 */
import './workflow/fetch-eater-sf.js'
import './workflow/fetch-sfist.js'
import './workflow/fetch-michelin.js'
import './workflow/search-restaurants.js'
import './workflow/fetch-funcheap.js'
import './workflow/fetch-famsf.js'
import './workflow/fetch-cal-academy.js'
import './workflow/search-events.js'
import './workflow/apply-discovered-items.js'
import './workflow/discover-menus.js'
import './workflow/daily-refresh.js'
import { startTaskServer } from '@renderinc/sdk/workflows'

console.info('[workflow] starting task server...')
startTaskServer().catch((error) => {
  console.error('[workflow] task server failed:', error)
  process.exit(1)
})
```

- [ ] **Step 2: Create `bin/trigger-workflow.ts`**

```typescript
/**
 * Render Cron trigger — lightweight script that starts the daily-refresh
 * workflow task via the Render API, then exits.
 */
import { Render } from '@renderinc/sdk'

const token = process.env.RENDER_API_KEY
if (!token) {
  console.error('[cron] RENDER_API_KEY is required')
  process.exit(1)
}

const slug = process.env.SF_PULSE_WORKFLOW_SLUG
if (!slug) {
  console.error('[cron] SF_PULSE_WORKFLOW_SLUG is required')
  process.exit(1)
}

const render = new Render({ token })

console.info(`[cron] triggering workflow ${slug}/daily-refresh...`)
try {
  const result = await render.workflows.runTask(`${slug}/daily-refresh`, [])
  console.info('[cron] workflow completed:', JSON.stringify(result))
} catch (error) {
  console.error('[cron] workflow failed:', error)
  process.exitCode = 1
}
```

- [ ] **Step 3: Commit**

```bash
git add bin/workflow.ts bin/trigger-workflow.ts
git commit -m "feat: add workflow entry point and cron trigger script"
```

---

### Task 6: Update build script

Add esbuild entries for the two new bundles. The `@renderinc/sdk` package (and its deps `eventsource`, `openapi-fetch`) must be bundled into the CJS output since they're ESM-only.

**Files:**
- Modify: `bin/build.ts:28-31`

- [ ] **Step 1: Add `@renderinc/sdk` to the bundled set**

In `bin/build.ts`, update the `bundled` set (line 6):

```typescript
const bundled = new Set(['pg', 'web-push', 'zod', '@renderinc/sdk', 'eventsource', 'openapi-fetch'])
```

- [ ] **Step 2: Add new esbuild entries**

In `bin/build.ts`, update the `serverEntries` object (line 28):

```typescript
  const serverEntries: Record<string, string> = {
    'dist/bin/migrate': 'bin/migrate.ts',
    'dist/bin/cron': 'bin/cron-refresh.ts',
    'dist/bin/workflow': 'bin/workflow.ts',
    'dist/bin/trigger-workflow': 'bin/trigger-workflow.ts',
  }
```

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: Build completes. `dist/bin/workflow.cjs` and `dist/bin/trigger-workflow.cjs` exist.

- [ ] **Step 4: Verify bundles exist**

Run: `ls -la dist/bin/workflow.cjs dist/bin/trigger-workflow.cjs`
Expected: Both files exist with non-zero size.

- [ ] **Step 5: Commit**

```bash
git add bin/build.ts
git commit -m "feat: add workflow and trigger-workflow to build entries"
```

---

### Task 7: Update render.yaml

Replace the cron service configuration and add the new workflow worker service.

**Files:**
- Modify: `render.yaml:43-61`

- [ ] **Step 1: Update the cron service**

Replace the existing cron service block (lines 43-61) with a lightweight trigger and a new workflow worker:

```yaml
  - type: cron
    name: sf-pulse-daily
    runtime: node
    plan: starter
    # 7:00 AM PDT = 14:00 UTC
    schedule: "0 14 * * *"
    buildCommand: npm ci --include=dev && npm run build
    startCommand: node dist/bin/trigger-workflow.cjs
    envVars:
      - key: RENDER_API_KEY
        sync: false
      - key: SF_PULSE_WORKFLOW_SLUG
        sync: false

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

- [ ] **Step 2: Commit**

```bash
git add render.yaml
git commit -m "feat: add workflow worker service, convert cron to lightweight trigger"
```

---

### Task 8: Update AGENTS.md with workflow documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add workflow section to AGENTS.md**

Add after the "Deployment" section:

```markdown

## Workflows

The daily scraping pipeline runs as Render Workflow tasks defined in `bin/workflow/`. Each external source (Eater SF, SFist, Michelin, Funcheap, FAMSF, Cal Academy, DuckDuckGo) is a separate task with its own retry policy and timeout.

The `daily-refresh` orchestrator task in `bin/workflow/daily-refresh.ts` calls source tasks via `Promise.allSettled`, deduplicates, persists via `applyDiscoveredItems`, and runs menu discovery.

Task wrappers are thin — all scraping logic lives in `bin/cron-refresh/`. For local dev, use `bin/cron-refresh.ts` directly (no workflow runtime needed).

The cron service (`sf-pulse-daily`) triggers the workflow via the Render SDK API. The workflow worker (`sf-pulse-workflow`) runs the task server.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add workflow architecture to AGENTS.md"
```

---

### Task 9: Typecheck and full test suite

**Files:** (none modified, verification only)

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build completes. All four CJS bundles exist in `dist/bin/`.

- [ ] **Step 4: Verify all bundles**

Run: `ls -la dist/bin/*.cjs`
Expected: `migrate.cjs`, `cron.cjs`, `workflow.cjs`, `trigger-workflow.cjs` all present.
