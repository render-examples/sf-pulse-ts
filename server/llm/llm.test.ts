import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type { LLMClient } from "./types.js";
import { extractStructured } from "./extract.js";
import {
  RestaurantExtractionSchema,
  EventExtractionSchema,
} from "./schemas.js";
import {
  extractRestaurantsFromArticles,
  extractEventsFromArticles,
} from "./pipeline.js";
import type { RawArticle } from "./types.js";
import { extractBodyText } from "../../bin/cron-refresh/html.js";

// ── Mock LLM Client ────────────────────────────────────────────────

function createMockLLMClient(
  responses: Map<string, unknown>,
): LLMClient {
  return {
    async extractStructured<T>(options: {
      schema: z.ZodType<T>;
      prompt: string;
      text: string;
    }): Promise<T> {
      for (const [key, value] of responses) {
        if (options.prompt.includes(key)) {
          return options.schema.parse(value);
        }
      }
      throw new Error(`No mock response for prompt containing: ${options.prompt.slice(0, 50)}`);
    },
  };
}

// ── Schema Validation Tests ────────────────────────────────────────

describe("RestaurantExtractionSchema", () => {
  it("accepts valid extraction", () => {
    const result = RestaurantExtractionSchema.parse({
      restaurants: [
        {
          name: "Test Kitchen",
          neighborhood: "Mission",
          cuisine: "New American",
          address: "123 Valencia St, San Francisco",
          opened_date: "April 2026",
        },
      ],
    });
    assert.equal(result.restaurants.length, 1);
    assert.equal(result.restaurants[0].name, "Test Kitchen");
  });

  it("accepts empty restaurant array", () => {
    const result = RestaurantExtractionSchema.parse({ restaurants: [] });
    assert.equal(result.restaurants.length, 0);
  });

  it("rejects missing required fields", () => {
    assert.throws(() => {
      RestaurantExtractionSchema.parse({
        restaurants: [{ name: "Test" }],
      });
    });
  });
});

describe("EventExtractionSchema", () => {
  it("accepts valid extraction", () => {
    const result = EventExtractionSchema.parse({
      events: [
        {
          title: "Jazz in the Park",
          location: "Golden Gate Park",
          date: "May 15, 2026",
          time: "7:00 PM – 10:00 PM",
          description: "Annual jazz festival in the park.",
        },
      ],
    });
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].title, "Jazz in the Park");
  });

  it("accepts null time and description", () => {
    const result = EventExtractionSchema.parse({
      events: [
        {
          title: "Art Walk",
          location: "SoMa",
          date: "June 2026",
          time: null,
          description: null,
        },
      ],
    });
    assert.equal(result.events[0].time, null);
    assert.equal(result.events[0].description, null);
  });
});

// ── extractStructured Tests ────────────────────────────────────────

describe("extractStructured()", () => {
  it("returns parsed result on success", async () => {
    const schema = z.object({ value: z.string() });
    const client = createMockLLMClient(
      new Map([["test", { value: "hello" }]]),
    );
    const result = await extractStructured(client, {
      schema,
      prompt: "test prompt",
      text: "some text",
    });
    assert.deepEqual(result, { value: "hello" });
  });

  it("retries on first failure and returns null on second failure", async () => {
    let callCount = 0;
    const failClient: LLMClient = {
      async extractStructured() {
        callCount++;
        throw new Error("API error");
      },
    };
    const schema = z.object({ value: z.string() });
    const result = await extractStructured(failClient, {
      schema,
      prompt: "test",
      text: "text",
    });
    assert.equal(result, null);
    assert.equal(callCount, 2);
  });
});

// ── Pipeline Tests ─────────────────────────────────────────────────

describe("extractRestaurantsFromArticles()", () => {
  it("extracts restaurants from raw articles", async () => {
    const client = createMockLLMClient(
      new Map([
        [
          "Extract ONLY restaurants",
          {
            restaurants: [
              {
                name: "Nopa 2.0",
                neighborhood: "NoPa",
                cuisine: "Californian",
                address: "560 Divisadero St, San Francisco",
                opened_date: "April 2026",
              },
            ],
          },
        ],
      ]),
    );

    const articles: RawArticle[] = [
      {
        source: "eater",
        url: "https://sf.eater.com/test",
        title: "Nopa 2.0 Opens in NoPa",
        pubDate: "2026-04-15",
        bodyText: "Nopa 2.0 has opened at 560 Divisadero...",
      },
    ];

    const results = await extractRestaurantsFromArticles(client, articles);
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "Nopa 2.0");
    assert.equal(results[0].neighborhood, "NoPa");
    assert.equal(results[0].source_url, "https://sf.eater.com/test");
  });

  it("returns empty array for empty input", async () => {
    const client = createMockLLMClient(new Map());
    const results = await extractRestaurantsFromArticles(client, []);
    assert.equal(results.length, 0);
  });
});

describe("extractEventsFromArticles()", () => {
  it("extracts events from raw articles", async () => {
    const client = createMockLLMClient(
      new Map([
        [
          "Extract events",
          {
            events: [
              {
                title: "Outside Lands 2026",
                location: "Golden Gate Park",
                date: "August 7 – 9, 2026",
                time: "11:00 AM – 10:00 PM",
                description: "Annual music festival in Golden Gate Park.",
              },
            ],
          },
        ],
      ]),
    );

    const articles: RawArticle[] = [
      {
        source: "funcheap",
        url: "https://sf.funcheap.com/test",
        title: "Outside Lands 2026",
        pubDate: "2026-07-01",
        bodyText: "Outside Lands returns to Golden Gate Park...",
      },
    ];

    const results = await extractEventsFromArticles(client, articles);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "Outside Lands 2026");
    assert.equal(results[0].source_url, "https://sf.funcheap.com/test");
  });
});

// ── HTML Truncation Tests ──────────────────────────────────────────

describe("extractBodyText()", () => {
  it("extracts content from article tags", () => {
    const html =
      '<nav>menu</nav><article><p>Restaurant Nopa 2.0 opened in NoPa neighborhood.</p></article><footer>footer</footer>';
    const result = extractBodyText(html);
    assert.ok(result.includes("Restaurant Nopa"));
    assert.ok(!result.includes("menu"));
    assert.ok(!result.includes("footer"));
  });

  it("extracts content from main tags", () => {
    const html =
      '<header>nav</header><main><p>Important content here.</p></main><footer>end</footer>';
    const result = extractBodyText(html);
    assert.ok(result.includes("Important content"));
  });

  it("truncates to 8000 characters", () => {
    const longContent = "x".repeat(10_000);
    const html = `<article><p>${longContent}</p></article>`;
    const result = extractBodyText(html);
    assert.ok(result.length <= 8_000);
  });

  it("falls back to full content when no semantic tags", () => {
    const html = "<div><p>Some content without article or main tags.</p></div>";
    const result = extractBodyText(html);
    assert.ok(result.includes("Some content"));
  });

  it("strips script and style tags", () => {
    const html =
      '<article><script>evil()</script><style>.x{color:red}</style><p>Clean text.</p></article>';
    const result = extractBodyText(html);
    assert.ok(result.includes("Clean text"));
    assert.ok(!result.includes("evil"));
    assert.ok(!result.includes("color"));
  });
});
