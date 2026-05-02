# LLM-Based Extraction Pipeline

Replaces brittle regex parsing with LLM structured extraction for restaurant openings, events, and menu analysis. Uses a two-phase architecture (fetch → extract) with a provider-agnostic LLM abstraction layer.

## Goals

1. Replace fragile regex cascades in Eater article parsing, museum event extraction, Funcheap description cleanup, and DuckDuckGo result parsing with LLM structured extraction.
2. Improve menu analysis: better dietary flag detection and cuisine validation/refinement from menu text.
3. Keep regex for well-structured sources (SFist RSS titles, JSON-LD, Michelin, URL extraction, dedup logic).
4. Provider-agnostic: support OpenAI and Anthropic with a single interface.
5. Graceful degradation: if no `LLM_API_KEY` is set or the provider is unavailable, the pipeline still runs — it just produces fewer results from regex-only sources.

## Non-Goals

- Full menu item extraction (prices, categories, individual dishes).
- Replacing the merge/dedup logic in `server/refresh.ts`.
- LLM-based event or restaurant deduplication.
- Real-time LLM calls in the web server request path.

## Architecture

### Two-Phase Pipeline

```
Phase 1: Fetch              Phase 2: Extract              Phase 3: Persist
─────────────               ────────────────              ────────────────
Eater RSS → RawArticle[]  ─┐
DDG HTML  → RawText       ─┤→ extractRestaurants(LLM) → NewRestaurant[]  ─┐
                            │                                               │
SFist RSS → NewRestaurant[] (regex, unchanged) ────────────────────────────┤
Michelin  → NewRestaurant[] (regex, unchanged) ────────────────────────────┤
                                                                           ├→ applyDiscoveredItems()
Funcheap  → RawArticle[]  ─┐                                              │
FAMSF     → RawPage       ─┤→ extractEvents(LLM)      → NewEvent[]      ─┤
CalAcad   → RawPage       ─┤                                              │
DDG HTML  → RawText       ─┘                                              ┘

Menu URLs → RawMenuText[] ──→ analyzeMenu(LLM)        → DietaryFlags + cuisine
```

**Phase 1 (Fetch):** Existing source scrapers fetch HTML/RSS and produce raw text + metadata. They stop before structured extraction. SFist and Michelin continue to produce `NewRestaurant[]` directly via regex since their formats are well-structured.

**Phase 2 (Extract):** A provider-agnostic LLM layer takes raw text and produces structured `NewRestaurant[]`, `NewEvent[]`, or `DietaryFlags + cuisine`. Multiple items can be batched into a single LLM call when combined text stays under ~6K tokens.

**Phase 3 (Persist):** Unchanged. `applyDiscoveredItems()` receives the same `NewRestaurant[]` and `NewEvent[]` types as today.

### Text Truncation

Before passing to the LLM, body text is truncated to ~8,000 characters (~2K tokens). The truncation targets the content within `<body>`, `<main>`, or `<article>` tags — stripping navigation, headers, footers, and sidebars first. If no semantic content tags are found, falls back to the first 8K characters of the stripped text.

## Provider-Agnostic LLM Layer

### File Structure

```
server/llm/
  index.ts              — createLLMClient(), re-exports
  types.ts              — LLMClient interface, ProviderConfig, RawArticle, RawMenuPage
  extract.ts            — extractStructured<T>() helper
  providers/
    openai.ts           — OpenAI adapter
    anthropic.ts        — Anthropic adapter
```

### Interface

```typescript
interface LLMClient {
  extractStructured<T>(options: {
    schema: ZodType<T>
    prompt: string
    text: string
    model?: string
  }): Promise<T>
}

type ProviderConfig = {
  provider: 'openai' | 'anthropic'
  apiKey: string
  model?: string
}
```

### Provider Selection

Configured via environment variables:

| Variable       | Required | Default        | Description                     |
| -------------- | -------- | -------------- | ------------------------------- |
| `LLM_PROVIDER` | No       | `openai`       | `openai` or `anthropic`         |
| `LLM_API_KEY`  | No       | —              | API key for the chosen provider |
| `LLM_MODEL`    | No       | `gpt-5.4-mini` | Model to use                    |

If `LLM_API_KEY` is not set, LLM extraction is silently skipped. The run produces results only from regex-based sources (SFist, Michelin).

### Structured Output

Each provider adapter converts the Zod schema to the provider's native structured output format:

- **OpenAI:** JSON mode with response_format / function calling
- **Anthropic:** Tool use with JSON schema

The response is validated against the Zod schema at runtime. If validation fails, one retry is attempted with a simplified prompt. If the retry also fails, the item is skipped with a warning log.

## Raw Item Types

Phase 1 fetchers produce these intermediate types:

```typescript
interface RawArticle {
  source: 'eater' | 'funcheap' | 'famsf' | 'calacademy' | 'ddg'
  url: string
  title: string
  pubDate: string | null
  bodyText: string // HTML stripped to plain text, truncated
  jsonLd?: unknown // raw JSON-LD if present
}

interface RawMenuPage {
  restaurantName: string
  restaurantId: number
  menuUrl: string
  text: string
  currentCuisine: string
}
```

### Fetcher Changes

| Fetcher                              | Current Return              | New Return                                                                   | Notes                                            |
| ------------------------------------ | --------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| `fetchEaterSF()`                     | `NewRestaurant[]`           | `RawArticle[]`                                                               | Stops before regex extraction                    |
| `fetchSFist()`                       | `NewRestaurant[]`           | `NewRestaurant[]`                                                            | **Unchanged** — regex is sufficient              |
| `fetchMichelinCaliforniaSelection()` | `NewRestaurant[]`           | `NewRestaurant[]`                                                            | **Unchanged**                                    |
| `fetchFuncheap()`                    | `NewEvent[]`                | `RawArticle[]`                                                               | JSON-LD preserved in `jsonLd` field              |
| `fetchFAMSF()`                       | `NewEvent[]`                | `RawArticle[]`                                                               | Stops before regex extraction                    |
| `fetchCalAcademy()`                  | `NewEvent[]`                | `RawArticle[]`                                                               | Stops before regex extraction                    |
| `discoverMenu()`                     | `{ menuUrl, dietaryFlags }` | Phase 1: `RawMenuPage`, Phase 2: `{ menuUrl, dietaryFlags, refinedCuisine }` | URL discovery stays regex; analysis moves to LLM |
| `extractRestaurants()`               | `NewRestaurant[]`           | Input to LLM instead                                                         | DDG text → LLM extraction                        |
| `extractEvents()`                    | `NewEvent[]`                | Input to LLM instead                                                         | DDG text → LLM extraction                        |

## Extraction Schemas & Prompts

### Restaurant Extraction

```typescript
const RestaurantExtractionSchema = z.object({
  restaurants: z.array(
    z.object({
      name: z.string(),
      neighborhood: z.string().default('San Francisco'),
      cuisine: z.string().default('New opening'),
      address: z.string().nullable(),
      opened_date: z.string(),
    }),
  ),
})
```

**System prompt guidance:**

- Extract only restaurants opening or recently opened in San Francisco
- Neighborhood: use SF neighborhood names (Mission, SoMa, Design District, etc.) or "San Francisco" if unclear
- Cuisine: be specific when the text says so ("Northern Thai" not "Thai"). Default "New opening" if not mentioned.
- Address: full street address if present, null otherwise
- Date: most specific available (day > month > season > year)
- Skip restaurants that are closing, relocating, or not in San Francisco

**Batching:** Multiple articles from the same source (e.g., several Eater RSS items) are combined into a single LLM call when total text is under ~6K tokens. Articles are delimited with `<article url="...">` tags.

### Event Extraction

```typescript
const EventExtractionSchema = z.object({
  events: z.array(
    z.object({
      title: z.string(),
      location: z.string().default('San Francisco'),
      date: z.string(),
      time: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
})
```

**System prompt guidance:**

- Extract events happening in San Francisco
- Title: the specific event name, not generic categories
- Location: venue name (not full address)
- Date: most specific format available. For date ranges, use "April 23 – 25, 2026"
- Time: if mentioned, in "7:30 PM – 11:00 PM" format
- Description: 1-2 sentence summary. Clean, no boilerplate or promotional language.
- Skip recurring/generic listings without a specific date

### Menu Analysis

```typescript
const MenuAnalysisSchema = z.object({
  dietary_flags: z.object({
    gluten_free: z.object({
      available: z.boolean(),
      confidence: z.enum(['confirmed', 'inferred']),
    }),
    vegan: z.object({
      available: z.boolean(),
      confidence: z.enum(['confirmed', 'inferred']),
    }),
    vegetarian: z.object({
      available: z.boolean(),
      confidence: z.enum(['confirmed', 'inferred']),
    }),
  }),
  refined_cuisine: z.string().nullable(),
})
```

**System prompt guidance:**

- "confirmed" = explicit menu labels (GF, Vegan, Gluten-Free section, etc.)
- "inferred" = ingredient analysis suggests availability but no explicit label
- `refined_cuisine`: propose a more specific/accurate cuisine if the current value is generic ("New opening") or inaccurate based on the menu. Return null to keep the current cuisine.

## Updated Pipeline Flow

### `run.ts` main()

```
1. Phase 1: Fetch (parallel, same as today)
   ├── fetchEaterSF() → RawArticle[]          (changed return type)
   ├── fetchSFist() → NewRestaurant[]          (unchanged)
   ├── searchWeb(restaurants) → raw HTML text
   ├── fetchFuncheap() → RawArticle[]          (changed return type)
   ├── fetchFAMSF() → RawArticle[]             (changed return type)
   ├── fetchCalAcademy() → RawArticle[]        (changed return type)
   └── searchWeb(events) → raw HTML text

2. Phase 2: LLM Extract (parallel, new)
   ├── llm.extractStructured(RestaurantSchema, eaterArticles) → NewRestaurant[]
   ├── llm.extractStructured(RestaurantSchema, ddgRestaurantText) → NewRestaurant[]
   ├── llm.extractStructured(EventSchema, funcheapArticles) → NewEvent[]
   ├── llm.extractStructured(EventSchema, famsfArticles) → NewEvent[]
   ├── llm.extractStructured(EventSchema, calAcademyArticles) → NewEvent[]
   └── llm.extractStructured(EventSchema, ddgEventText) → NewEvent[]

3. Merge regex + LLM results, dedup (unchanged logic)

4. applyDiscoveredItems() (unchanged)

5. Menu discovery
   ├── findMenuUrls() (unchanged)
   └── llm.extractStructured(MenuSchema, menuText) → DietaryFlags + cuisine
```

### Render Workflow Tasks

Each workflow task in `bin/workflow/` currently calls its source's fetch function. The change:

- Tasks that previously returned `NewRestaurant[]` or `NewEvent[]` now return `RawArticle[]`
- The `daily-refresh` orchestrator collects raw items from all tasks, then runs LLM extraction in Phase 2
- SFist and Michelin tasks continue returning `NewRestaurant[]` directly

## Error Handling

| Failure                            | Behavior                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `LLM_API_KEY` not set              | LLM extraction silently skipped. Only regex sources produce results.       |
| LLM API rate limit / network error | Log warning, skip that batch. Other batches and regex sources unaffected.  |
| Structured output validation fails | Retry once with simplified prompt. If retry fails, skip item with warning. |
| LLM returns empty array            | Treated as "no results found" — same as regex returning nothing today.     |

No regex fallback for LLM-targeted sources. If LLM is unavailable, those sources produce 0 items for that run.

## Testing Strategy

### Unit Tests

- **LLM client mock:** Tests create a mock `LLMClient` that returns canned structured responses. No real API calls in tests.
- **Schema validation:** Verify Zod schemas accept valid extractions and reject malformed ones.
- **Fetcher changes:** Verify Phase 1 fetchers produce valid `RawArticle` objects with proper truncation.
- **Pipeline integration:** Verify `main()` correctly chains Phase 1 → Phase 2 → Phase 3 with mocked LLM.

### Snapshot Tests

- Store recorded LLM responses in `test/fixtures/llm-responses/` for regression testing.
- Compare extraction quality over time as prompts are refined.

### Existing Tests

- All existing tests continue to pass — they test regex-based extraction which remains for SFist/Michelin.
- Tests run without any env vars (no `LLM_API_KEY` needed).

## Dependencies

### New npm Packages

| Package              | Purpose                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `openai`             | OpenAI API client (includes `zodResponseFormat` for native Zod→structured output)           |
| `@anthropic-ai/sdk`  | Anthropic API client                                                                        |
| `zod-to-json-schema` | Convert Zod schemas to JSON Schema for Anthropic tool use (OpenAI has built-in Zod support) |

### Build Changes

`openai` and `@anthropic-ai/sdk` need to be added to the bundled set in `bin/build.ts` (alongside `@renderinc/sdk`, `eventsource`, `openapi-fetch`).

## Cost Estimate

Rough per-run estimate using `gpt-4o-mini` ($0.15/1M input, $0.60/1M output):

| Extraction      | Items/Run       | ~Tokens In | ~Tokens Out | Cost            |
| --------------- | --------------- | ---------- | ----------- | --------------- |
| Eater articles  | ~5-10 articles  | ~15K       | ~2K         | ~$0.004         |
| DDG restaurants | 1 batch         | ~2K        | ~500        | ~$0.001         |
| Funcheap events | ~10-20 articles | ~20K       | ~3K         | ~$0.005         |
| Museum events   | 2 pages         | ~6K        | ~1K         | ~$0.002         |
| DDG events      | 1 batch         | ~2K        | ~500        | ~$0.001         |
| Menu analysis   | ~5-10 menus     | ~20K       | ~1K         | ~$0.004         |
| **Total**       |                 | ~65K       | ~8K         | **~$0.015/run** |

Well within the $0.50–2.00/run budget. Using `gpt-4o` would be ~15x more (~$0.23/run), still within budget.
