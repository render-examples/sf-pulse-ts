# Workflow Diagram Tab — Design

**Date:** 2026-05-05
**Status:** Draft (pending implementation plan)

## Goal

Add a new `/diagram` page to SF Pulse that visualizes the daily refresh workflow defined in `bin/workflow/` using the [render-examples/workflow-visualizer](https://github.com/render-examples/workflow-visualizer) React component. Surface the page through a third "tab" in the existing nav on `index.astro`, alongside Restaurants and Events.

## Non-goals

- Auto-generating the workflow config from the TypeScript source. The visualizer requires hand-tuned node positions and animation sequences that can't reasonably be derived.
- Live data: the diagram is a static visualization of the pipeline structure, not a runtime monitor of in-flight workflow executions.
- Refactoring the existing Restaurants/Events tabs. Their current anchor-scroll behavior is preserved exactly.
- Adding tests for the visualizer itself. It's a static config plus a third-party UI component; verification is a manual browser check.

## Architecture

A new Astro route `/diagram` renders a full-page workflow visualization as a React island (`client:only="react"`). The existing `index.astro` gets a third nav anchor that links out to `/diagram` — it is not a same-page section.

```
index.astro nav:
  [ Restaurants ]  [ Events ]  [ Diagram → /diagram ]
                                  ↑ standard <a> link, not an in-page anchor

/diagram page:
  <WorkflowDiagram client:only="react" />   ← imports workflow-visualizer,
                                              renders <WorkflowVisualizer config={...} />
```

This keeps the React/Tailwind/Framer-Motion world isolated to the diagram page. `index.astro` and all other pages stay on plain Astro + custom CSS with no React hydration overhead.

## File layout

```
src/
  pages/
    index.astro              # MODIFIED: add a third <a> in <nav class="tabs">
    diagram.astro            # NEW: thin host page for the React island
  components/
    diagram/
      WorkflowDiagram.tsx    # NEW: imports & renders <WorkflowVisualizer config={...} />
      workflow-config.ts     # NEW: the WorkflowConfig describing bin/workflow/
      tailwind.css           # NEW: @tailwind base/components/utilities (scoped)
astro.config.mjs             # MODIFIED: register @astrojs/react and @astrojs/tailwind
tailwind.config.mjs          # NEW: content scoped to src/components/diagram + diagram.astro
package.json                 # MODIFIED: new deps (see below)
```

## Dependencies

Added to root `package.json`:

| Package | Purpose |
|---|---|
| `@astrojs/react` | Astro integration to render React islands |
| `@astrojs/tailwind` | Astro integration for Tailwind |
| `react`, `react-dom` | Required by visualizer |
| `@types/react`, `@types/react-dom` | TS types |
| `framer-motion` | Required by visualizer (peer dep) |
| `tailwindcss` | Required by visualizer (peer dep) |
| `workflow-visualizer` | The visualizer itself, installed from `github:render-examples/workflow-visualizer` |

## Tailwind scoping

The visualizer needs Tailwind with a dark theme. The existing app uses plain custom CSS with no Tailwind. To prevent Tailwind's preflight reset from breaking existing styles:

1. Configure `@astrojs/tailwind` with `applyBaseStyles: false` so Tailwind's global CSS is not auto-injected.
2. Import `src/components/diagram/tailwind.css` only from `diagram.astro` (and only that page). Pages that don't import it never receive Tailwind's preflight or utility classes.
3. `tailwind.config.mjs` sets `content: ['./src/components/diagram/**/*.{ts,tsx,astro}', './src/pages/diagram.astro']` so utility classes are only scanned and emitted from those files.
4. The Tailwind theme colors expected by the visualizer (dark theme) are configured in `tailwind.config.mjs`.

This keeps `index.astro`, the map page, and all other existing styling untouched.

## WorkflowConfig contents

`workflow-config.ts` exports a single `WorkflowConfig` describing `bin/workflow/daily-refresh.ts`. Hand-authored, not generated.

### Nodes

- **1 trigger:** `daily-cron` — Render cron service `sf-pulse-daily` that calls `dailyRefreshTask` via the Render SDK.
- **1 orchestrator:** `daily-refresh` — `dailyRefreshTask` in `bin/workflow/daily-refresh.ts`.
- **8 source tasks (parallel fetchers):**
  - Restaurants: `fetch-eater-sf`, `fetch-sfist`, `fetch-michelin`, `search-restaurants`
  - Events: `fetch-funcheap`, `fetch-famsf`, `fetch-cal-academy`, `search-events`
- **1 LLM task:** `llm-extraction` — groups the parallel `extractRestaurantsFromArticles` / `extractEventsFromArticles` calls in `daily-refresh.ts` (the visualizer's node model doesn't need one node per article batch).
- **2 sink tasks:** `apply-discovered-items`, `discover-menus`.

Each node's `details` field surfaces useful per-task info pulled from the corresponding `bin/workflow/*.ts` file: timeout, retry policy (when present), one-line description.

### Edges

```
daily-cron ─▶ daily-refresh ─┬─▶ fetch-eater-sf ────────┐
                             ├─▶ fetch-sfist ───────────┤
                             ├─▶ fetch-michelin ────────┤
                             ├─▶ search-restaurants ────┤
                             ├─▶ fetch-funcheap ────────┼─▶ llm-extraction ─▶ apply-discovered-items ─▶ discover-menus
                             ├─▶ fetch-famsf ───────────┤
                             ├─▶ fetch-cal-academy ─────┤
                             └─▶ search-events ─────────┘
```

### Trigger flow

A single `triggerFlows` entry for `daily-cron` with an `animationSequence` whose steps walk the phases of `daily-refresh.ts`:

1. **Trigger fires** — `daily-cron` → `daily-refresh`
2. **Phase 1: fetch restaurant sources** — fan-out to the 4 restaurant fetchers (`Promise.allSettled` in `daily-refresh.ts:43-48`)
3. **Phase 2: fetch event sources** — fan-out to the 4 event fetchers (`daily-refresh.ts:60-66`)
4. **Phase 3: LLM extraction** — converge into `llm-extraction` (`daily-refresh.ts:89-118`)
5. **Phases 4 & 5: persist & menu discovery** — `apply-discovered-items` then `discover-menus` (`daily-refresh.ts:135-143`)

`defaultTrigger` is `daily-cron`.

## index.astro tab change

The existing `<nav class="tabs">` block (around line 189) currently contains two anchors with classes `tab tabRestaurants` and `tab tabEvents`. Add a third with class `tab tabDiagram`, `href="/diagram"`. Style it identically to the other two; no other changes to `index.astro`.

## Build & deploy

`bin/build.ts` already orchestrates the Astro build. Astro picks up the new `@astrojs/react` and `@astrojs/tailwind` integrations automatically — no changes to `bin/build.ts` are required. The new page is statically prerendered by Astro along with the rest of the site.

`render.yaml` is unchanged: the same web service serves the new page.

## Testing

- **`npm run typecheck`** — must pass with the new TSX files. If `tsconfig.test.json` doesn't already cover `src/components/diagram/`, extend its `include` glob.
- **`npm test`** — unaffected. No changes to `server/`, `shared/`, or `bin/workflow/` runtime code, so no new tests are added.
- **`npm run build`** — must produce `dist/` including the new `/diagram` page.
- **Manual verification:**
  1. `npm run dev`
  2. Open `http://127.0.0.1:5000/`, confirm Restaurants and Events still render and behave identically.
  3. Click the new "Diagram" tab — it navigates to `/diagram`.
  4. Confirm the workflow visualization renders and the animation sequence plays.
  5. Confirm no console errors and no Tailwind styles bleeding into `/`.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Tailwind preflight breaks existing custom CSS on `/` | Set `applyBaseStyles: false`, scope Tailwind imports to `diagram.astro` only |
| GitHub-installed `workflow-visualizer` lacks a stable version pin | Pin to a commit SHA in `package.json` (e.g., `github:render-examples/workflow-visualizer#<sha>`) once an initial integration is verified |
| Adding React hydration to a previously React-free site | Use `client:only="react"` on the diagram component and load it only on `/diagram`; other pages remain hydration-free |
| `WorkflowConfig` drifts from `bin/workflow/` over time as tasks are added/removed | Out of scope for this design; treat as a doc-comment / changelog discipline. Auto-derivation could be a future enhancement. |
