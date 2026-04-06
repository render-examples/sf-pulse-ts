import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractRestaurants,
  fetchEaterSF,
  fetchSFist,
  parseEaterArticle,
} from "../cron-refresh.js";
import { readFixture } from "./test-helpers.js";

const eaterOpeningsHtml = readFixture("eater-openings-april-2026.html");

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
    const [restaurant] = extractRestaurants(text, []);
    assert.equal(restaurant.neighborhood, "San Francisco");
    assert.equal(restaurant.cuisine, "New opening");
    assert.equal(restaurant.address, null);
    assert.equal(restaurant.source_url, null);
    assert.ok(restaurant.opened_date.length > 0);
  });

  it("returns empty array when no patterns match", () => {
    assert.deepEqual(extractRestaurants("Nothing to see here.", []), []);
  });

  it("ignores names shorter than 3 characters", () => {
    assert.deepEqual(extractRestaurants(`"AB" opens today.`, []), []);
  });
});

describe("parseEaterArticle()", () => {
  it("extracts restaurant names from subheadings in roundup articles", () => {
    const html = `
      <article>
        <h2>Alpha Cafe</h2>
        <p>Alpha Cafe opens in the Mission this week.</p>
        <h2>Beta Bistro</h2>
        <p>Beta Bistro is now open downtown.</p>
        <h2>More From Eater SF</h2>
      </article>
    `;

    const results = parseEaterArticle(
      html,
      [],
      "https://sf.eater.com/article/alpha-beta",
      "April 2026",
    );

    assert.deepEqual(
      results.map((result) => result.name),
      ["Alpha Cafe", "Beta Bistro"],
    );
    assert.ok(
      results.every(
        (result) =>
          result.source_url === "https://sf.eater.com/article/alpha-beta",
      ),
    );
  });

  it("parses saved live Eater openings HTML without chrome headings", () => {
    const results = parseEaterArticle(
      eaterOpeningsHtml,
      [],
      "https://sf.eater.com/restaurant-news/211948/san-francisco-bay-area-restaurant-bar-openings-april-2026",
      "April 2026",
    );
    const names = results.map((result) => result.name);

    assert.ok(names.includes("Ka Kai"));
    assert.ok(names.includes("Studio Estepan"));
    assert.ok(names.includes("Tita Becca’s"));
    assert.ok(names.includes("Causwells"));
    assert.ok(!names.includes("April 2"));
    assert.ok(!names.includes("Eater SF"));
    assert.ok(!names.includes("Most Popular"));
    assert.ok(!names.includes("The Latest"));
  });
});

describe("fetchEaterSF()", () => {
  it("parses linked roundup articles instead of inserting the article title", async () => {
    const originalFetch = globalThis.fetch;
    const rssXml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title type="html"><![CDATA[14 Restaurant Openings to Know About Right Now]]></title>
          <link rel="alternate" href="https://sf.eater.com/article/list"/>
          <published>2026-04-03T18:05:42-04:00</published>
          <summary type="html"><![CDATA[A running list of new spots.]]></summary>
        </entry>
      </feed>`;
    const articleHtml = `
      <article>
        <h2>Alpha Cafe</h2>
        <p>Alpha Cafe opens in the Mission.</p>
        <h2>Beta Bistro</h2>
        <p>Beta Bistro is now open in SoMa.</p>
      </article>
    `;

    globalThis.fetch = (async (input: string | URL | RequestInfo) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url === "https://sf.eater.com/rss/index.xml") {
        return new Response(rssXml, { status: 200 });
      }
      if (url === "https://sf.eater.com/article/list") {
        return new Response(articleHtml, { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    try {
      const results = await fetchEaterSF([]);
      assert.deepEqual(
        results.map((result) => result.name),
        ["Alpha Cafe", "Beta Bistro"],
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("fetchSFist()", () => {
  it("filters non-opening and non-SF items from RSS", async () => {
    const originalFetch = globalThis.fetch;
    const rssXml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Foxtail opens in San Francisco</title>
            <link>https://sfist.com/foxtail</link>
            <pubDate>Sun, 05 Apr 2026 12:00:00 GMT</pubDate>
            <description>New restaurant arrives in SF.</description>
          </item>
          <item>
            <title>Weekend weather in Oakland</title>
            <link>https://sfist.com/weather</link>
            <pubDate>Sun, 05 Apr 2026 12:00:00 GMT</pubDate>
            <description>Forecast only.</description>
          </item>
          <item>
            <title>Bar Iris opens in San Jose</title>
            <link>https://sfist.com/bar-iris</link>
            <pubDate>Sun, 05 Apr 2026 12:00:00 GMT</pubDate>
            <description>New bar outside the city.</description>
          </item>
        </channel>
      </rss>`;

    globalThis.fetch = (async () =>
      new Response(rssXml, { status: 200 })) as typeof fetch;

    try {
      const results = await fetchSFist([]);
      assert.equal(results.length, 1);
      assert.equal(results[0].name, "Foxtail");
      assert.equal(results[0].source_url, "https://sfist.com/foxtail");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
