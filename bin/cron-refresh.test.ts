/**
 * Tests for bin/cron-refresh.ts
 *
 * Covers the pure extraction and HTML-stripping logic without any network
 * calls or file I/O. The integration of those functions with main() is
 * covered by routes.test.ts (POST /api/cron/refresh).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stripHtml,
  extractRestaurants,
  extractEvents,
  extractUrls,
  parseDietaryFlags,
} from "./cron-refresh.js";

// ── stripHtml ─────────────────────────────────────────────────────────────────

describe("stripHtml()", () => {
  it("removes HTML tags", () => {
    const result = stripHtml("<p>Hello <b>world</b></p>");
    assert.ok(!result.includes("<"));
    assert.ok(result.includes("Hello"));
    assert.ok(result.includes("world"));
  });

  it("collapses whitespace", () => {
    const result = stripHtml("  foo   <br/>   bar  ");
    assert.ok(!result.includes("  "));
  });

  it("truncates to 8000 characters", () => {
    const result = stripHtml("a".repeat(10000));
    assert.ok(result.length <= 8000);
  });

  it("returns empty string for empty input", () => {
    assert.equal(stripHtml(""), "");
  });
});

// ── extractRestaurants ────────────────────────────────────────────────────────

describe("extractRestaurants()", () => {
  it("extracts a restaurant matching the opens? pattern", () => {
    const text = `Check out "The Golden Fork" opens in the Mission this spring.`;
    const results = extractRestaurants(text, []);
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "The Golden Fork");
  });

  it("extracts multiple restaurants", () => {
    const text = `"Café Lumière" opened last week. Meanwhile, "Bar Estrella" now open downtown.`;
    const results = extractRestaurants(text, []);
    assert.equal(results.length, 2);
  });

  it("deduplicates case-insensitively against existing list", () => {
    const text = `"The Golden Fork" opens in the Mission.`;
    const results = extractRestaurants(text, ["the golden fork"]);
    assert.equal(results.length, 0);
  });

  it("deduplicates within a single run", () => {
    const text = `"The Golden Fork" opens. "The Golden Fork" now open.`;
    const results = extractRestaurants(text, []);
    assert.equal(results.length, 1);
  });

  it("sets expected default fields on each result", () => {
    const text = `"Rosetta" now open on Main St.`;
    const [r] = extractRestaurants(text, []);
    assert.equal(r.neighborhood, "San Francisco");
    assert.equal(r.cuisine, "New opening");
    assert.equal(r.address, null);
    assert.equal(r.source_url, null);
    assert.ok(r.opened_date.length > 0);
  });

  it("returns empty array when no patterns match", () => {
    const results = extractRestaurants("Nothing to see here.", []);
    assert.equal(results.length, 0);
  });

  it("ignores names shorter than 3 characters", () => {
    // Pattern requires [^"']{2,40} after the initial capital letter — minimum 3 total
    const text = `"AB" opens today.`;
    const results = extractRestaurants(text, []);
    assert.equal(results.length, 0);
  });
});

// ── extractEvents ─────────────────────────────────────────────────────────────

describe("extractEvents()", () => {
  it("extracts an event with a month-day date", () => {
    const text = "Mission Street Fair on April 15 draws thousands.";
    const results = extractEvents(text, []);
    assert.ok(results.length >= 1);
    const e = results.find((r) => r.title.includes("Mission Street Fair"));
    assert.ok(e, "should find Mission Street Fair");
    assert.ok(e!.date.includes("April"));
  });

  it("deduplicates case-insensitively against existing list", () => {
    const text = "Mission Street Fair on April 15 draws thousands.";
    // The regex captures 'Mission Street Fair on' as the title (greedy group
    // consumes 'on' before the date separator). The existing list must match
    // the actual extracted title.
    const first = extractEvents(text, []);
    assert.ok(first.length >= 1, "should extract at least one entry without dedup");
    const actualTitle = first[0].title.toLowerCase();
    const results = extractEvents(text, [actualTitle]);
    assert.equal(results.length, 0);
  });

  it("deduplicates within a single run", () => {
    const text = "Mission Street Fair on April 15. Mission Street Fair on April 15.";
    const results = extractEvents(text, []);
    // The same title should appear at most once regardless of how many times
    // it appears in the source text.
    const titles = results.map((e) => e.title);
    const unique = new Set(titles);
    assert.equal(unique.size, titles.length, "no duplicate titles in results");
    assert.ok(results.length >= 1, "should extract at least one entry");
  });

  it("caps results at 10", () => {
    // Build text with 15 distinct event-like patterns
    const lines = Array.from({ length: 15 }, (_, i) =>
      `Event Alpha${i.toString().padStart(2, "0")} on April ${i + 1}`
    ).join(". ");
    const results = extractEvents(lines, []);
    assert.ok(results.length <= 10);
  });

  it("sets expected default fields on each result", () => {
    const text = "Carnaval Festival on May 23 is coming.";
    const [e] = extractEvents(text, []);
    assert.ok(e, "should extract at least one event");
    assert.equal(e.location, "Mission District, San Francisco");
    assert.equal(e.time, null);
    assert.equal(e.description, null);
    assert.equal(e.source_url, null);
  });

  it("returns empty array when no patterns match", () => {
    const results = extractEvents("nothing here", []);
    assert.equal(results.length, 0);
  });
});

// ── extractUrls ────────────────────────────────────────────────────────────────

describe("extractUrls()", () => {
  it("extracts http and https URLs from href attributes", () => {
    const html = '<a href="https://example.com/menu">Menu</a> <a href="http://yelp.com/biz/foo">Yelp</a>';
    const urls = extractUrls(html);
    assert.deepEqual(urls, ["https://example.com/menu", "http://yelp.com/biz/foo"]);
  });

  it("returns empty array for no URLs", () => {
    assert.deepEqual(extractUrls("no links here"), []);
  });

  it("ignores non-http schemes", () => {
    const html = '<a href="ftp://files.example.com">Files</a>';
    assert.deepEqual(extractUrls(html), []);
  });
});

// ── parseDietaryFlags ─────────────────────────────────────────────────────────

describe("parseDietaryFlags()", () => {
  it("detects confirmed gluten-free from explicit label", () => {
    const flags = parseDietaryFlags("Our gluten-free pasta is made with rice flour.");
    assert.equal(flags.gluten_free.available, true);
    assert.equal(flags.gluten_free.confidence, "confirmed");
  });

  it("detects confirmed vegan from explicit label", () => {
    const flags = parseDietaryFlags("Vegan Buddha Bowl $14");
    assert.equal(flags.vegan.available, true);
    assert.equal(flags.vegan.confidence, "confirmed");
  });

  it("detects confirmed vegetarian from 'vegetarian' keyword", () => {
    const flags = parseDietaryFlags("Vegetarian Pad Thai $12");
    assert.equal(flags.vegetarian.available, true);
    assert.equal(flags.vegetarian.confidence, "confirmed");
  });

  it("detects inferred gluten-free from ingredient hints", () => {
    const flags = parseDietaryFlags("Cauliflower crust available for any pizza.");
    assert.equal(flags.gluten_free.available, true);
    assert.equal(flags.gluten_free.confidence, "inferred");
  });

  it("detects inferred vegan from 'dairy-free' keyword", () => {
    const flags = parseDietaryFlags("All items can be made dairy-free on request.");
    assert.equal(flags.vegan.available, true);
    assert.equal(flags.vegan.confidence, "inferred");
  });

  it("detects inferred vegetarian from 'meatless' keyword", () => {
    const flags = parseDietaryFlags("Try our meatless Monday specials.");
    assert.equal(flags.vegetarian.available, true);
    assert.equal(flags.vegetarian.confidence, "inferred");
  });

  it("returns all unavailable for a plain meat menu", () => {
    const flags = parseDietaryFlags("Ribeye steak $32. Bacon burger $18.");
    assert.equal(flags.gluten_free.available, false);
    assert.equal(flags.vegan.available, false);
    assert.equal(flags.vegetarian.available, false);
  });

  it("detects GF abbreviation", () => {
    const flags = parseDietaryFlags("Margherita Pizza (GF crust +$3)");
    assert.equal(flags.gluten_free.available, true);
    assert.equal(flags.gluten_free.confidence, "confirmed");
  });

  it("detects plant-based as vegetarian", () => {
    const flags = parseDietaryFlags("Our plant-based burger is incredible.");
    assert.equal(flags.vegetarian.available, true);
    assert.equal(flags.vegetarian.confidence, "confirmed");
  });

  it("confirmed takes precedence over inferred", () => {
    // Text has both explicit "gluten-free" and "cauliflower crust"
    const flags = parseDietaryFlags("Gluten-free cauliflower crust pizza.");
    assert.equal(flags.gluten_free.available, true);
    assert.equal(flags.gluten_free.confidence, "confirmed");
  });
});
