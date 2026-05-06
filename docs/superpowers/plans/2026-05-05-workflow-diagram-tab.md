# Workflow Diagram Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/diagram` page that renders a workflow visualization of `bin/workflow/daily-refresh.ts` using `render-examples/workflow-visualizer`, exposed as a third nav tab on `index.astro` next to Restaurants and Events.

**Architecture:** New Astro route at `/diagram` hosts a React island (`client:only="react"`) that renders `<WorkflowVisualizer config={...} />`. The hand-authored `WorkflowConfig` mirrors the 5-phase pipeline in `daily-refresh.ts`. React + Tailwind + Framer Motion are added as new top-level dependencies, but Tailwind is scoped (`applyBaseStyles: false` + per-page CSS import + narrow `content` glob) so the existing custom CSS on `index.astro` and other pages is untouched. Third "tab" is just an `<a href="/diagram">` styled like the existing tab anchors.

**Tech Stack:** Astro 6, React 18, Tailwind CSS, Framer Motion 11, `workflow-visualizer` (GitHub install), TypeScript.

**Reference:** Spec at `docs/superpowers/specs/2026-05-05-workflow-diagram-tab-design.md`.

---

## File map

- **Create**
  - `src/pages/diagram.astro` — host page for the React island
  - `src/components/diagram/WorkflowDiagram.tsx` — React component that renders `<WorkflowVisualizer />`
  - `src/components/diagram/workflow-config.ts` — `WorkflowConfig` data describing `bin/workflow/`
  - `src/components/diagram/workflow-config.test.ts` — internal-consistency tests for the config
  - `src/components/diagram/tailwind.css` — `@tailwind base/components/utilities`, imported only by `diagram.astro`
  - `tailwind.config.mjs` — content scope, theme extension
- **Modify**
  - `package.json` — add deps
  - `astro.config.mjs` — register `@astrojs/react` and `@astrojs/tailwind`, add `vite.ssr.noExternal` for the visualizer
  - `src/pages/index.astro` — add a third anchor to the `<nav class="tabs">` block

---

### Task 1: Install dependencies and register Astro integrations

**Files:**
- Modify: `package.json`
- Modify: `astro.config.mjs`
- Create: `tailwind.config.mjs`

- [ ] **Step 1: Add dependencies to `package.json`**

In the `"dependencies"` block, add the following entries (keep alphabetical order with existing entries):

```json
"@astrojs/react": "^4.0.0",
"@astrojs/tailwind": "^5.1.0",
"framer-motion": "^11.0.0",
"react": "^18.3.0",
"react-dom": "^18.3.0",
"tailwindcss": "^3.4.0",
"workflow-visualizer": "github:render-examples/workflow-visualizer"
```

In the `"devDependencies"` block, add:

```json
"@types/react": "^18.3.0",
"@types/react-dom": "^18.3.0"
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: completes without errors. `node_modules/workflow-visualizer/` exists and contains a `src/` directory with `index.ts`.

- [ ] **Step 3: Replace `astro.config.mjs`**

Replace the entire file with:

```js
import { defineConfig } from 'astro/config'
import node from '@astrojs/node'
import react from '@astrojs/react'
import tailwind from '@astrojs/tailwind'
import path from 'node:path'

export default defineConfig({
  adapter: node({
    mode: 'standalone',
  }),
  output: 'static',
  server: {
    host: true,
  },
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  vite: {
    resolve: {
      alias: {
        '@shared': path.resolve('./shared'),
      },
    },
    ssr: {
      noExternal: ['workflow-visualizer'],
    },
  },
})
```

Why `applyBaseStyles: false`: prevents Tailwind's preflight reset from being injected into every page. Tailwind CSS is loaded only from `diagram.astro` via an explicit import.

Why `ssr.noExternal: ['workflow-visualizer']`: the package's `main` points at raw TypeScript (`src/index.ts`) rather than a built bundle. Forcing Vite to process it (instead of treating it as an external Node module) ensures it is transpiled during SSR/build.

- [ ] **Step 4: Create `tailwind.config.mjs`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/components/diagram/**/*.{ts,tsx,astro}',
    './src/pages/diagram.astro',
    './node_modules/workflow-visualizer/src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
}
```

Why include the visualizer's source in `content`: the package ships raw TSX with Tailwind utility classes. Tailwind's JIT only emits CSS for classes it sees during scanning. If the visualizer's source isn't scanned, its utility classes won't appear in the compiled CSS and the diagram will render unstyled.

- [ ] **Step 5: Verify the dev server still boots**

Run: `npm run dev`
Expected: server starts on `http://127.0.0.1:5000` with no errors. Visit `/` and confirm the existing Restaurants and Events sections render with their normal custom styling (no Tailwind preflight reset bleeding in). Stop the server (Ctrl-C).

- [ ] **Step 6: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: passes. Astro check picks up the new integrations.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tailwind.config.mjs
git commit -m "chore: add React, Tailwind, framer-motion, workflow-visualizer deps"
```

---

### Task 2: Create scoped Tailwind CSS entry

**Files:**
- Create: `src/components/diagram/tailwind.css`

- [ ] **Step 1: Create the CSS file**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

This file is imported only from `diagram.astro` (Task 5). No other page references it, so Tailwind's reset and utilities are confined to `/diagram`.

- [ ] **Step 2: Commit**

```bash
git add src/components/diagram/tailwind.css
git commit -m "feat(diagram): add scoped Tailwind entry for diagram page"
```

---

### Task 3: Write the failing config-validation test

**Files:**
- Create: `src/components/diagram/workflow-config.test.ts`

The config's correctness boils down to: every edge endpoint is a real node, every trigger-flow node/edge ID is real, and every animation step references real node/edge IDs. These are the cheap-but-valuable invariants worth a unit test.

- [ ] **Step 1: Write the test**

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { workflowConfig } from './workflow-config.ts'

describe('workflowConfig', () => {
  it('every edge references existing node IDs', () => {
    const nodeIds = new Set(workflowConfig.nodes.map((n) => n.id))
    for (const edge of workflowConfig.edges) {
      assert.ok(
        nodeIds.has(edge.from),
        `edge ${edge.id} has unknown 'from' node ${edge.from}`,
      )
      assert.ok(
        nodeIds.has(edge.to),
        `edge ${edge.id} has unknown 'to' node ${edge.to}`,
      )
    }
  })

  it('every trigger flow references existing node and edge IDs', () => {
    const nodeIds = new Set(workflowConfig.nodes.map((n) => n.id))
    const edgeIds = new Set(workflowConfig.edges.map((e) => e.id))
    for (const flow of workflowConfig.triggerFlows) {
      for (const id of flow.nodes) {
        assert.ok(nodeIds.has(id), `flow ${flow.triggerId}: unknown node ${id}`)
      }
      for (const id of flow.edges) {
        assert.ok(edgeIds.has(id), `flow ${flow.triggerId}: unknown edge ${id}`)
      }
      for (const step of flow.animationSequence) {
        for (const id of step.activeNodes) {
          assert.ok(
            nodeIds.has(id),
            `flow ${flow.triggerId} step ${step.id}: unknown active node ${id}`,
          )
        }
        for (const id of step.activeEdges) {
          assert.ok(
            edgeIds.has(id),
            `flow ${flow.triggerId} step ${step.id}: unknown active edge ${id}`,
          )
        }
      }
    }
  })

  it('defaultTrigger names a real trigger flow', () => {
    const flowIds = new Set(
      workflowConfig.triggerFlows.map((f) => f.triggerId),
    )
    assert.ok(
      flowIds.has(workflowConfig.defaultTrigger),
      `defaultTrigger '${workflowConfig.defaultTrigger}' has no matching flow`,
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx/esm --test src/components/diagram/workflow-config.test.ts`
Expected: fails with a module-resolution error for `./workflow-config.ts` (it doesn't exist yet).

- [ ] **Step 3: Commit (red)**

```bash
git add src/components/diagram/workflow-config.test.ts
git commit -m "test(diagram): add invariants for workflow-config (red)"
```

---

### Task 4: Implement `workflow-config.ts`

**Files:**
- Create: `src/components/diagram/workflow-config.ts`

The config mirrors the five phases of `bin/workflow/daily-refresh.ts`:

| Phase (in `daily-refresh.ts`) | Lines | Maps to nodes |
|---|---|---|
| Trigger fires | (cron service `sf-pulse-daily`) | `daily-cron`, `daily-refresh` |
| Phase 1: fetch restaurant sources (parallel) | 43–48 | 4 fetcher nodes |
| Phase 2: fetch event sources (parallel) | 60–66 | 4 fetcher nodes |
| Phase 3: LLM extraction (parallel) | 89–118 | `llm-extraction` |
| Phase 4 + 5: persist & menus | 135–143 | `apply-discovered-items`, `discover-menus` |

- [ ] **Step 1: Write the file**

```ts
import type { WorkflowConfig } from 'workflow-visualizer'

export const workflowConfig: WorkflowConfig = {
  title: 'SF Pulse Daily Refresh',
  subtitle: 'Render Workflow that scrapes restaurant openings and Mission events every day',
  defaultTrigger: 'daily-cron',
  nodes: [
    {
      id: 'daily-cron',
      label: 'Daily Cron',
      type: 'trigger',
      description: 'Render cron service sf-pulse-daily',
      position: { x: 40, y: 240 },
      details: [
        { label: 'Schedule', value: 'Daily' },
        { label: 'Service', value: 'sf-pulse-daily' },
        { label: 'Mechanism', value: 'Render SDK trigger' },
      ],
    },
    {
      id: 'daily-refresh',
      label: 'daily-refresh',
      type: 'orchestrator',
      description: 'Orchestrates the full pipeline (bin/workflow/daily-refresh.ts)',
      position: { x: 240, y: 240 },
      details: [
        { label: 'Timeout', value: '600s' },
        { label: 'Phases', value: '5 (fetch × 2, LLM, persist, menus)' },
      ],
    },

    // Phase 1: restaurant sources
    {
      id: 'fetch-eater-sf',
      label: 'fetch-eater-sf',
      type: 'task',
      description: 'Fetch Eater SF article list',
      position: { x: 480, y: 60 },
      details: [{ label: 'Source', value: 'eater.com/sf' }],
    },
    {
      id: 'fetch-sfist',
      label: 'fetch-sfist',
      type: 'task',
      description: 'Fetch SFist (regex extractor)',
      position: { x: 480, y: 140 },
      details: [{ label: 'Source', value: 'sfist.com' }],
    },
    {
      id: 'fetch-michelin',
      label: 'fetch-michelin',
      type: 'task',
      description: 'Fetch Michelin Guide SF (regex extractor)',
      position: { x: 480, y: 220 },
      details: [{ label: 'Source', value: 'guide.michelin.com' }],
    },
    {
      id: 'search-restaurants',
      label: 'search-restaurants',
      type: 'task',
      description: 'DuckDuckGo search for new SF restaurants',
      position: { x: 480, y: 300 },
      details: [{ label: 'Source', value: 'DuckDuckGo' }],
    },

    // Phase 2: event sources
    {
      id: 'fetch-funcheap',
      label: 'fetch-funcheap',
      type: 'task',
      description: 'Fetch Funcheap event listings',
      position: { x: 480, y: 380 },
      details: [{ label: 'Source', value: 'sf.funcheap.com' }],
    },
    {
      id: 'fetch-famsf',
      label: 'fetch-famsf',
      type: 'task',
      description: 'Fetch Fine Arts Museums of SF events',
      position: { x: 480, y: 460 },
      details: [{ label: 'Source', value: 'famsf.org' }],
    },
    {
      id: 'fetch-cal-academy',
      label: 'fetch-cal-academy',
      type: 'task',
      description: 'Fetch California Academy of Sciences events',
      position: { x: 480, y: 540 },
      details: [{ label: 'Source', value: 'calacademy.org' }],
    },
    {
      id: 'search-events',
      label: 'search-events',
      type: 'task',
      description: 'DuckDuckGo search for Mission District events',
      position: { x: 480, y: 620 },
      details: [{ label: 'Source', value: 'DuckDuckGo' }],
    },

    // Phase 3: LLM extraction
    {
      id: 'llm-extraction',
      label: 'llm-extraction',
      type: 'task',
      description: 'Extract structured restaurants & events from raw articles',
      position: { x: 760, y: 340 },
      details: [
        { label: 'Provider', value: 'OpenAI or Anthropic (LLM_PROVIDER)' },
        { label: 'Fallback', value: 'regex-only when LLM_API_KEY unset' },
      ],
    },

    // Phase 4 & 5: persist + menus
    {
      id: 'apply-discovered-items',
      label: 'apply-discovered-items',
      type: 'task',
      description: 'Upsert into Postgres, broadcast SSE delta, send push notifications',
      position: { x: 1000, y: 340 },
      details: [{ label: 'Storage', value: 'Postgres (server/storage.ts)' }],
    },
    {
      id: 'discover-menus',
      label: 'discover-menus',
      type: 'task',
      description: 'Discover menu URLs and parse dietary flags',
      position: { x: 1240, y: 340 },
      details: [{ label: 'Parser', value: 'AI dietary-flag extractor' }],
    },
  ],
  edges: [
    { id: 'cron-to-orchestrator', from: 'daily-cron', to: 'daily-refresh' },
    { id: 'orch-eater', from: 'daily-refresh', to: 'fetch-eater-sf' },
    { id: 'orch-sfist', from: 'daily-refresh', to: 'fetch-sfist' },
    { id: 'orch-michelin', from: 'daily-refresh', to: 'fetch-michelin' },
    { id: 'orch-search-r', from: 'daily-refresh', to: 'search-restaurants' },
    { id: 'orch-funcheap', from: 'daily-refresh', to: 'fetch-funcheap' },
    { id: 'orch-famsf', from: 'daily-refresh', to: 'fetch-famsf' },
    { id: 'orch-calacademy', from: 'daily-refresh', to: 'fetch-cal-academy' },
    { id: 'orch-search-e', from: 'daily-refresh', to: 'search-events' },
    { id: 'eater-llm', from: 'fetch-eater-sf', to: 'llm-extraction' },
    { id: 'sfist-llm', from: 'fetch-sfist', to: 'llm-extraction' },
    { id: 'michelin-llm', from: 'fetch-michelin', to: 'llm-extraction' },
    { id: 'search-r-llm', from: 'search-restaurants', to: 'llm-extraction' },
    { id: 'funcheap-llm', from: 'fetch-funcheap', to: 'llm-extraction' },
    { id: 'famsf-llm', from: 'fetch-famsf', to: 'llm-extraction' },
    { id: 'calacademy-llm', from: 'fetch-cal-academy', to: 'llm-extraction' },
    { id: 'search-e-llm', from: 'search-events', to: 'llm-extraction' },
    { id: 'llm-apply', from: 'llm-extraction', to: 'apply-discovered-items' },
    { id: 'apply-menus', from: 'apply-discovered-items', to: 'discover-menus' },
  ],
  triggerFlows: [
    {
      triggerId: 'daily-cron',
      nodes: [
        'daily-cron',
        'daily-refresh',
        'fetch-eater-sf',
        'fetch-sfist',
        'fetch-michelin',
        'search-restaurants',
        'fetch-funcheap',
        'fetch-famsf',
        'fetch-cal-academy',
        'search-events',
        'llm-extraction',
        'apply-discovered-items',
        'discover-menus',
      ],
      edges: [
        'cron-to-orchestrator',
        'orch-eater',
        'orch-sfist',
        'orch-michelin',
        'orch-search-r',
        'orch-funcheap',
        'orch-famsf',
        'orch-calacademy',
        'orch-search-e',
        'eater-llm',
        'sfist-llm',
        'michelin-llm',
        'search-r-llm',
        'funcheap-llm',
        'famsf-llm',
        'calacademy-llm',
        'search-e-llm',
        'llm-apply',
        'apply-menus',
      ],
      animationSequence: [
        {
          id: 'trigger-fires',
          activeNodes: ['daily-cron', 'daily-refresh'],
          activeEdges: ['cron-to-orchestrator'],
          duration: 1200,
          title: 'Cron fires',
          description: 'The daily Render cron triggers the dailyRefresh orchestrator.',
        },
        {
          id: 'phase-1-restaurants',
          activeNodes: [
            'fetch-eater-sf',
            'fetch-sfist',
            'fetch-michelin',
            'search-restaurants',
          ],
          activeEdges: ['orch-eater', 'orch-sfist', 'orch-michelin', 'orch-search-r'],
          duration: 1600,
          title: 'Phase 1: fetch restaurant sources',
          description:
            'Four fetchers run in parallel via Promise.allSettled (daily-refresh.ts:43-48).',
        },
        {
          id: 'phase-2-events',
          activeNodes: [
            'fetch-funcheap',
            'fetch-famsf',
            'fetch-cal-academy',
            'search-events',
          ],
          activeEdges: [
            'orch-funcheap',
            'orch-famsf',
            'orch-calacademy',
            'orch-search-e',
          ],
          duration: 1600,
          title: 'Phase 2: fetch event sources',
          description:
            'Four event fetchers run in parallel (daily-refresh.ts:60-66).',
        },
        {
          id: 'phase-3-llm',
          activeNodes: ['llm-extraction'],
          activeEdges: [
            'eater-llm',
            'sfist-llm',
            'michelin-llm',
            'search-r-llm',
            'funcheap-llm',
            'famsf-llm',
            'calacademy-llm',
            'search-e-llm',
          ],
          duration: 1600,
          title: 'Phase 3: LLM extraction',
          description:
            'Raw articles are converted to structured restaurants and events (daily-refresh.ts:89-118).',
        },
        {
          id: 'phase-4-5-persist-menus',
          activeNodes: ['apply-discovered-items', 'discover-menus'],
          activeEdges: ['llm-apply', 'apply-menus'],
          duration: 1600,
          title: 'Phases 4 & 5: persist & menu discovery',
          description:
            'Upsert into Postgres, broadcast SSE deltas, send push notifications, then crawl menus (daily-refresh.ts:135-143).',
        },
      ],
    },
  ],
}
```

- [ ] **Step 2: Run the config test to verify it passes**

Run: `node --import tsx/esm --test src/components/diagram/workflow-config.test.ts`
Expected: 3 tests pass.

- [ ] **Step 3: Run the full test suite to make sure nothing else broke**

Run: `npm test`
Expected: all tests pass, including the 3 new config tests.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Commit (green)**

```bash
git add src/components/diagram/workflow-config.ts
git commit -m "feat(diagram): add WorkflowConfig for daily-refresh pipeline"
```

---

### Task 5: Build the React island component

**Files:**
- Create: `src/components/diagram/WorkflowDiagram.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { WorkflowVisualizer } from 'workflow-visualizer'
import { workflowConfig } from './workflow-config.ts'

export default function WorkflowDiagram() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <WorkflowVisualizer config={workflowConfig} />
    </div>
  )
}
```

The wrapping `<div>` matches the `bg-zinc-950` dark surface the visualizer is designed for (per its dev/main.tsx). `min-h-screen` ensures the dark background fills the viewport even if the visualization itself is shorter.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: passes. The visualizer's types resolve from `node_modules/workflow-visualizer/src/index.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/components/diagram/WorkflowDiagram.tsx
git commit -m "feat(diagram): add WorkflowDiagram React island"
```

---

### Task 6: Create the `/diagram` Astro page

**Files:**
- Create: `src/pages/diagram.astro`

- [ ] **Step 1: Create the page**

```astro
---
import WorkflowDiagram from '../components/diagram/WorkflowDiagram.tsx'
import '../components/diagram/tailwind.css'
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SF Pulse — Workflow Diagram</title>
    <meta
      name="description"
      content="Visualization of the SF Pulse daily refresh workflow."
    />
  </head>
  <body>
    <WorkflowDiagram client:only="react" />
  </body>
</html>
```

This page is intentionally minimal: no nav, no shared layout. The visualizer fills the viewport. The Tailwind CSS import is local to this page so its preflight does not affect any other page.

- [ ] **Step 2: Smoke-test in the dev server**

Run: `npm run dev`
Then visit `http://127.0.0.1:5000/diagram` in a browser.
Expected:
- The page loads with a dark background.
- The workflow visualization renders with the trigger node, orchestrator, fetchers, LLM, apply, and menus nodes.
- Animation can be played (controls visible).
- No errors in the browser console.

Then visit `http://127.0.0.1:5000/`.
Expected: the home page looks identical to before — Restaurants and Events sections render with their normal styling. No Tailwind preflight bleed-through.

Stop the dev server (Ctrl-C).

- [ ] **Step 3: Commit**

```bash
git add src/pages/diagram.astro
git commit -m "feat(diagram): add /diagram page"
```

---

### Task 7: Add the third "tab" to `index.astro`

**Files:**
- Modify: `src/pages/index.astro` (the `<nav class="tabs">` block, currently lines 189-207)

- [ ] **Step 1: Add the third anchor**

In `src/pages/index.astro`, find the `<nav class="tabs">` block. After the closing `</a>` of `<a class="tab tabEvents" href="#events">…</a>` (around line 206), insert a third anchor:

```astro
<a class="tab tabDiagram" href="/diagram">
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="6" cy="6" r="3"></circle>
    <circle cx="18" cy="6" r="3"></circle>
    <circle cx="12" cy="18" r="3"></circle>
    <line x1="6" y1="9" x2="12" y2="15"></line>
    <line x1="18" y1="9" x2="12" y2="15"></line>
  </svg>
  Diagram
</a>
```

The icon is a simple node-graph glyph. The `tabDiagram` class is included for parity with `tabRestaurants` / `tabEvents` in case the project's CSS targets those for per-tab accents — if no CSS rule is defined for `tabDiagram`, the existing `tab` class styling applies and that is fine.

- [ ] **Step 2: Smoke-test in the dev server**

Run: `npm run dev`
Visit `http://127.0.0.1:5000/`.
Expected:
- A third "Diagram" tab appears next to Restaurants and Events.
- It is styled like the existing tabs (icon + label).
- Clicking it navigates to `/diagram` and renders the visualization.
- Hitting back in the browser returns to the home page unchanged.

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat(diagram): add Diagram tab to home nav"
```

---

### Task 8: Production build & final verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: passes, including the 3 new tests in `src/components/diagram/workflow-config.test.ts`.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: completes. `dist/` contains:
- the existing server bundles (entry.mjs, migrate.cjs, cron.cjs, workflow.cjs, trigger-workflow.cjs)
- the prerendered `/diagram` page
- the visualizer's JS as part of the client bundle

If the build fails because Vite refuses to transpile `workflow-visualizer`, double-check that `vite.ssr.noExternal: ['workflow-visualizer']` is present in `astro.config.mjs` (Task 1, Step 3).

- [ ] **Step 4: Smoke-test the production build**

Run: `npm start`
Visit `http://127.0.0.1:4321/diagram` (or whatever port the start script reports).
Expected: the diagram renders identically to dev mode. Tailwind classes from the visualizer are present in the compiled CSS (use the browser inspector to confirm node colors, borders, etc. are not unstyled).
Visit `/`. Expected: home page unchanged from before this work.

Stop the server.

- [ ] **Step 5: Commit (no-op if everything was already committed)**

If any final tweaks were needed during verification, commit them here:

```bash
git status
# if anything is dirty:
git add <files>
git commit -m "fix(diagram): <description>"
```

Otherwise nothing to commit — the feature is complete.

---

## Done criteria

- `npm run typecheck` passes.
- `npm test` passes (including 3 new config tests).
- `npm run build` produces a `dist/` containing the `/diagram` page.
- Manual: `/` renders identically to before, with a new "Diagram" tab in the nav. The Diagram tab links to `/diagram`, which renders the workflow-visualizer animation of `daily-refresh.ts`.
