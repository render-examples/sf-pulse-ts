# Map & "Near Me" Views

## Summary

A standalone `/map` page with a custom SVG map of SF neighborhoods. Clicking a neighborhood opens an inline sidebar panel showing restaurants and events in that area. A "Use my location" button maps the user's geolocation to the nearest neighborhood and auto-selects it. The page connects to the existing SSE stream for realtime updates.

No database changes. No geocoding API. No new npm dependencies for the map itself. The SVG is self-contained.

## Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Map precision | Neighborhood clusters | Matches existing data model; no geocoding API needed |
| Map placement | Standalone `/map` page | Clean separation from existing home page tabs |
| "Near me" UX | Manual picker + optional geolocation button | Works everywhere; geolocation is progressive enhancement |
| Map library | Custom SVG | Zero dependencies, PWA-friendly, ~5-15KB, unique look |
| Click behavior | Inline sidebar panel | Map stays visible while browsing items |
| Realtime | SSE via `/api/events-stream` | Consistent with home page; updates neighborhood counts live |

## Page Layout

### Desktop (>768px)

```
┌──────────────────────────────────────────────────┐
│ Header (same as home: logo, nav link to home)    │
├─────────────────────────────┬────────────────────┤
│                             │                    │
│   SVG Map                   │  Sidebar Panel     │
│   (neighborhoods with       │  (restaurants +    │
│    count badges)            │   events list)     │
│                             │                    │
│   [📍 Use my location]     │                    │
│                             │                    │
├─────────────────────────────┴────────────────────┤
```

Map takes ~60% width, sidebar panel takes ~40%. When no neighborhood is selected, the panel shows a prompt: "Tap a neighborhood to explore".

### Mobile (<768px)

```
┌──────────────────────┐
│ Header               │
├──────────────────────┤
│                      │
│   SVG Map            │
│   (compact, ~40vh)   │
│                      │
│   [📍 Use my location]
├──────────────────────┤
│                      │
│   Bottom panel       │
│   (scrollable list)  │
│                      │
└──────────────────────┘
```

Map occupies the top ~40% of the viewport. Panel slides up from below when a neighborhood is selected, scrollable independently.

## SVG Map

### Source

SF neighborhood boundaries from public open data (DataSF / SF Planning). Simplified to cover the 12 neighborhoods already recognized in `shared/catalog.ts` plus an "Other SF" catch-all region. Target: under 15KB uncompressed.

### Neighborhoods

The following neighborhoods get dedicated `<path>` regions, matching `NEIGHBORHOOD_ALIASES` in `shared/catalog.ts`:

1. Mission
2. SoMa
3. Potrero Hill
4. Golden Gate Park
5. Financial District
6. Civic Center
7. Marina
8. Yerba Buena
9. Haight
10. Sunset
11. Richmond
12. Castro
13. Other SF (remaining area, single path or group of paths)

### Visual Design

- Each neighborhood path has a fill color from a muted palette (CSS custom properties for theming)
- On hover: lighten fill, show neighborhood name tooltip
- On select: saturated fill, slight scale or stroke highlight
- Count badges: small circles positioned at approximate neighborhood centers, showing the number of restaurants + events. Hidden when count is 0.
- The user's location (if granted) shows as a pulsing dot at the lat/lng position, overlaid on the SVG using absolute positioning mapped from geo coordinates to SVG viewport coordinates.

### Interaction

- Click/tap a neighborhood path → highlights it, populates sidebar panel
- Click/tap again or click a different neighborhood → switches selection
- Click/tap outside any neighborhood → deselects, panel shows prompt

## Neighborhood Center Coordinates

Add approximate center lat/lng for each neighborhood to `shared/catalog.ts`. These are used for:

1. Mapping browser geolocation to nearest neighborhood (Haversine or simple Euclidean on small scale)
2. Positioning count badges on the SVG
3. Positioning the user's location dot

```typescript
// Added to each entry in NEIGHBORHOOD_ALIASES
{ label: "Mission", center: { lat: 37.7599, lng: -122.4148 }, patterns: [...] }
```

The "nearest neighborhood" calculation is a simple loop over the ~13 entries comparing distances — no spatial index needed.

## Sidebar Panel

### Content

When a neighborhood is selected, the panel shows:

**Header:** Neighborhood name + total count (e.g., "Mission — 12 restaurants, 5 events")

**Restaurants section:**
- List of restaurant cards: name, cuisine, opened date
- Each card links to `/restaurants/:id`
- Sorted by `opened_start_date` descending (newest first)

**Events section:**
- List of event cards: title, date, category badge
- Each card links to `/events/:id`
- Sorted by event date ascending (soonest first)

**Empty state:** "No restaurants or events in [neighborhood] yet."

### Rendering

Reuse rendering patterns from `shared/render.ts` (escapeHtml, detail hrefs). The panel uses a simpler card layout rather than the home page's table rows — compact cards are more appropriate for a sidebar.

## "Near Me" Feature

### Flow

1. Page loads with no neighborhood selected
2. User clicks "Use my location" button (below the map)
3. Browser prompts for geolocation permission (standard Geolocation API)
4. On success: compute nearest neighborhood by distance to center coordinates
5. Auto-select that neighborhood on the map, populate panel
6. Show user's position as a pulsing dot on the SVG
7. On error/deny: show a toast "Couldn't get your location. Tap a neighborhood instead."

### Geolocation → SVG Positioning

The SVG has a known bounding box (SF roughly 37.70–37.81 lat, -122.52–-122.35 lng). Map the user's lat/lng to SVG viewport coordinates with a linear transform. This only needs to be approximate — the dot just needs to land in the right neighborhood visually.

### Persistence

Do not persist the user's location. No cookies, no localStorage for geolocation. The "near me" feature is stateless — they tap the button each time they want it.

## Data Flow

### Initial Load (SSR)

1. `src/pages/map.astro` fetches all restaurants + events via `getInitialData()` (same as home page)
2. Groups items by neighborhood using `restaurant.neighborhood` and `deriveEventNeighborhood(event)`
3. Computes per-neighborhood counts
4. Renders SVG with count badges server-side
5. Serializes full data as inline JSON for client hydration (same pattern as home page's `serializeForInlineScript`)

### Client Hydration

`src/scripts/map.ts` picks up the serialized data and:

1. Attaches click handlers to SVG neighborhood paths
2. Renders the sidebar panel on neighborhood selection
3. Connects to `/api/events-stream` SSE
4. Wires up the "Use my location" button

### Realtime Updates

When SSE deltas arrive (restaurant or event upserted/deleted):

1. Update the in-memory data collections (same `updateCollection` pattern from home.ts)
2. Recompute neighborhood counts
3. Update count badges on the SVG
4. If the affected item's neighborhood is currently selected, re-render the panel

## New Files

| File | Purpose |
|------|---------|
| `src/pages/map.astro` | SSR page: fetches data, renders SVG + panel shell, serializes data for client |
| `src/scripts/map.ts` | Client JS: SVG interaction, panel rendering, SSE, geolocation |
| `src/styles/map.css` | Styles for the map page layout, SVG, panel, responsive breakpoints |
| `src/components/sf-neighborhoods.svg` | The SF neighborhood SVG (inline-able, ~15KB) |

## Modified Files

| File | Change |
|------|--------|
| `shared/catalog.ts` | Add `center: { lat, lng }` to `NEIGHBORHOOD_ALIASES` entries, export the type and array |
| `src/pages/index.astro` | Add a nav link to `/map` in the header |

## No Changes Needed

- **No database migrations** — works with existing `neighborhood` text column and `deriveEventNeighborhood()`
- **No new API endpoints** — reuses `/api/restaurants`, `/api/events`, `/api/events-stream`
- **No new npm dependencies** — SVG is hand-crafted, geolocation is browser-native
- **No changes to `server/`** — all new code is in `src/` (Astro pages + client scripts) and `shared/`

## Testing

- **`shared/catalog.test.ts`** — test nearest-neighborhood calculation with known coordinates (user in Mission → returns "Mission", user in Ocean Beach → returns "Sunset" or "Other SF")
- **`src/scripts/map.test.ts`** — test neighborhood grouping logic, count computation, delta update handling (unit tests on pure functions extracted from the client script)
- **Manual** — verify SVG renders on mobile Safari, Chrome, Firefox; verify geolocation flow; verify SSE updates change counts

## Navigation

Add a map pin icon link in the home page header (next to the push bell), linking to `/map`. The map page header links back to home.

## Accessibility

- SVG neighborhood paths get `role="button"`, `tabindex="0"`, `aria-label="[Neighborhood]: [count] restaurants, [count] events"`
- Keyboard navigation: Tab through neighborhoods, Enter/Space to select
- Sidebar panel uses `aria-live="polite"` so screen readers announce content changes
- "Use my location" button has clear label and announces result via toast (which uses `role="status"`)
- Color is not the only indicator of selection — selected neighborhoods also get a visible border/stroke change
