import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  discoverMenu,
  extractUrls,
  findMenuUrls,
  parseDietaryFlags,
} from "../cron-refresh.js";

describe("extractUrls()", () => {
  it("extracts http and https URLs from href attributes", () => {
    const html =
      '<a href="https://example.com/menu">Menu</a> <a href="http://yelp.com/biz/foo">Yelp</a>';
    assert.deepEqual(extractUrls(html), [
      "https://example.com/menu",
      "http://yelp.com/biz/foo",
    ]);
  });

  it("returns empty array for no URLs", () => {
    assert.deepEqual(extractUrls("no links here"), []);
  });

  it("ignores non-http schemes", () => {
    assert.deepEqual(
      extractUrls('<a href="ftp://files.example.com">Files</a>'),
      [],
    );
  });
});

describe("parseDietaryFlags()", () => {
  it("detects confirmed gluten-free from explicit label", () => {
    const flags = parseDietaryFlags(
      "Our gluten-free pasta is made with rice flour.",
    );
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
    const flags = parseDietaryFlags(
      "Cauliflower crust available for any pizza.",
    );
    assert.equal(flags.gluten_free.available, true);
    assert.equal(flags.gluten_free.confidence, "inferred");
  });

  it("detects inferred vegan from 'dairy-free' keyword", () => {
    const flags = parseDietaryFlags(
      "All items can be made dairy-free on request.",
    );
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
    const flags = parseDietaryFlags("Gluten-free cauliflower crust pizza.");
    assert.equal(flags.gluten_free.available, true);
    assert.equal(flags.gluten_free.confidence, "confirmed");
  });
});

describe("findMenuUrls()", () => {
  it("deduplicates, filters search URLs, and sorts likely menu pages first", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      const html =
        calls === 1
          ? `
            <a href="https://example.com/location">Site</a>
            <a href="https://example.com/menu">Menu</a>
            <a href="https://www.google.com/search?q=test">Search</a>
          `
          : `
            <a href="https://yelp.com/biz/test">Yelp</a>
            <a href="https://example.com/menu">Menu again</a>
            <a href="https://duckduckgo.com/l/?uddg=test">DDG</a>
          `;
      return new Response(html, { status: 200 });
    }) as typeof fetch;

    try {
      const urls = await findMenuUrls("Test Bistro");
      assert.deepEqual(urls, [
        "https://example.com/menu",
        "https://yelp.com/biz/test",
        "https://example.com/location",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("discoverMenu()", () => {
  it("returns the first parseable menu page and inferred dietary flags", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | RequestInfo) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.startsWith("https://html.duckduckgo.com/html/")) {
        return new Response(
          `
            <a href="https://example.com/about">About</a>
            <a href="https://example.com/menu">Menu</a>
          `,
          { status: 200 },
        );
      }
      if (url === "https://example.com/about") {
        return new Response("<html><body>About us only.</body></html>", {
          status: 200,
        });
      }
      if (url === "https://example.com/menu") {
        return new Response(
          `
            <html><body>
              <h1>Dinner Menu</h1>
              <p>Appetizer</p>
              <p>Cauliflower crust pizza</p>
              <p>Vegan option available</p>
            </body></html>
          `,
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    try {
      const result = await discoverMenu("Test Bistro");
      assert.equal(result.menuUrl, "https://example.com/menu");
      assert.equal(result.dietaryFlags.gluten_free.available, true);
      assert.equal(result.dietaryFlags.gluten_free.confidence, "inferred");
      assert.equal(result.dietaryFlags.vegan.available, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to the first candidate when no menu page is parseable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | RequestInfo) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.startsWith("https://html.duckduckgo.com/html/")) {
        return new Response(
          `<a href="https://example.com/location">Location</a>`,
          { status: 200 },
        );
      }
      if (url === "https://example.com/location") {
        return new Response("<html><body>Visit us.</body></html>", {
          status: 200,
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    try {
      const result = await discoverMenu("Test Bistro");
      assert.equal(result.menuUrl, "https://example.com/location");
      assert.equal(result.dietaryFlags.gluten_free.available, false);
      assert.equal(result.dietaryFlags.vegan.available, false);
      assert.equal(result.dietaryFlags.vegetarian.available, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
