import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  extractMichelinPublicationUrls,
  extractRestaurants,
  fetchEaterSF,
  fetchMichelinCaliforniaSelection,
  fetchSFist,
  parseEaterArticle,
  parseMichelinSelectionPage,
} from "../cron-refresh.js";
import { setLookupOverrideForTests } from "./http.js";
import { readFixture } from "./test-helpers.js";
import { setOpenAIClientForTests } from "./openai.js";

const eaterOpeningsHtml = readFixture("eater-openings-april-2026.html");
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

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
    assert.ok(!names.includes("Studio Estepan"));
    assert.ok(!names.includes("Tita Becca’s"));
    assert.ok(!names.includes("Causwells"));
    assert.ok(!names.includes("April 2"));
    assert.ok(!names.includes("Eater SF"));
    assert.ok(!names.includes("Most Popular"));
    assert.ok(!names.includes("The Latest"));
  });

  it("ignores non-restaurant callout headings", () => {
    const html = `
      <article>
        <h2>Insider tip</h2>
        <p>Do not ingest this callout label.</p>
        <h2>Take note</h2>
        <p>Do not ingest this one either.</p>
        <h2>What to order</h2>
        <p>This is also editorial chrome.</p>
        <h2>Alpha Cafe</h2>
        <p>Alpha Cafe opens in the Mission this week.</p>
      </article>
    `;

    const results = parseEaterArticle(
      html,
      [],
      "https://sf.eater.com/article/alpha",
      "April 2026",
    );

    assert.deepEqual(
      results.map((result) => result.name),
      ["Alpha Cafe"],
    );
  });

  it("strips article-title prefixes and keeps the roundup month from the source URL", () => {
    const html = `
      <article>
        <p>INGLESIDE — Tablehopper also has the scoop on Bên Tre opening its third location as of Tuesday, March 24. The restaurant serves Vietnamese dishes and more. 2650 Ocean Avenue, San Francisco</p>
        <p>CASTRO — Tablehopper caught the news that Parasol at Flore (in the former Cafe Flore space) is now open and serving coffee. 2298 Market Street, San Francisco</p>
      </article>
    `;

    const results = parseEaterArticle(
      html,
      [],
      "https://sf.eater.com/restaurant-news/211576/san-francisco-bay-area-restaurant-bar-openings-march-2026",
      "March 2027",
    );

    assert.deepEqual(
      results.map((result) => result.name),
      ["Bên Tre", "Parasol at Flore"],
    );
    assert.deepEqual(
      results.map((result) => result.opened_date),
      ["March 2026", "March 2026"],
    );
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

    setOpenAIClientForTests({
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: JSON.stringify({ restaurants: [
              { name: 'Alpha Cafe', neighborhood: 'Mission', cuisine: 'Cafe', address: null, opened_date: 'April 2026' },
              { name: 'Beta Bistro', neighborhood: 'SoMa', cuisine: 'Bistro', address: null, opened_date: 'April 2026' },
            ] }) } }],
          }),
        },
      },
    })
    try {
      setLookupOverrideForTests(publicLookup);
      const results = await fetchEaterSF([]);
      assert.deepEqual(
        results.map((result) => result.name),
        ["Alpha Cafe", "Beta Bistro"],
      );
    } finally {
      setLookupOverrideForTests(null);
      globalThis.fetch = originalFetch;
      setOpenAIClientForTests(undefined)
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

describe("parseMichelinSelectionPage()", () => {
  it("extracts San Francisco restaurants with star counts and publication date", () => {
    const html = `
      <article>
        <p class="ds__addon-end-content">08-06-2024</p>
        <span>Two MICHELIN Stars</span>
        <span>Sons &amp; Daughters (San Francisco; Contemporary)</span>
        <span>Aubergine (Carmel-by-the-Sea; Contemporary)</span>
        <span>One MICHELIN Star</span>
        <span>Hilda and Jesse (San Francisco; American)</span>
        <span>7 Adams (San Francisco; Californian)</span>
        <span>Hero Award</span>
      </article>
    `;

    const results = parseMichelinSelectionPage(
      html,
      "https://www.michelin.com/en/publications/products-and-services/michelin-guide-california-2024-selection",
    );

    assert.deepEqual(
      results.map((result) => ({
        name: result.name,
        opened_date: result.opened_date,
        highlight_kind: result.highlight_kind,
      })),
      [
        {
          name: "Sons & Daughters",
          opened_date: "2 stars · August 6, 2024",
          highlight_kind: "michelin",
        },
        {
          name: "Hilda and Jesse",
          opened_date: "1 star · August 6, 2024",
          highlight_kind: "michelin",
        },
        {
          name: "7 Adams",
          opened_date: "1 star · August 6, 2024",
          highlight_kind: "michelin",
        },
      ],
    );
  });
});

describe("extractMichelinPublicationUrls()", () => {
  it("extracts Michelin publication URLs from search HTML", () => {
    const html = `
      <a href="https://www.michelin.com/en/publications/products-and-services/michelin-guide-california-2024-selection">direct</a>
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.michelin.com%2Fen%2Fpublications%2Fproducts-and-services%2Fmichelin-guide-california-2025-selection">encoded</a>
    `;

    assert.deepEqual(extractMichelinPublicationUrls(html), [
      "https://www.michelin.com/en/publications/products-and-services/michelin-guide-california-2024-selection",
      "https://www.michelin.com/en/publications/products-and-services/michelin-guide-california-2025-selection",
    ]);
  });
});

describe("fetchMichelinCaliforniaSelection()", () => {
  it("uses the current-year Michelin publication when available", async () => {
    const originalFetch = globalThis.fetch;
    const michelinHtml = `
      <article>
        <p class="ds__addon-end-content">08-06-2024</p>
        <span>One MICHELIN Star</span>
        <span>Hilda and Jesse (San Francisco; American)</span>
      </article>
    `;

    globalThis.fetch = (async (input: string | URL | RequestInfo) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url === "https://www.michelin.com/en/publications/products-and-services/michelin-guide-california-2024-selection") {
        return new Response(michelinHtml, { status: 200 });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    try {
      setLookupOverrideForTests(publicLookup);
      const results = await fetchMichelinCaliforniaSelection(
        new Date(Date.UTC(2024, 7, 10)),
      );
      assert.deepEqual(results.map((result) => result.name), ["Hilda and Jesse"]);
    } finally {
      setLookupOverrideForTests(null);
      globalThis.fetch = originalFetch;
    }
  });
});

describe('fetchEaterSF() AI integration', () => {
  afterEach(() => {
    setOpenAIClientForTests(undefined)
    setLookupOverrideForTests(null)
  })

  it('throws when OPENAI_API_KEY is not set and no test client is injected', async () => {
    const saved = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    const originalFetch = globalThis.fetch
    const pubDate = new Date().toUTCString()
    globalThis.fetch = (async (input: string | URL | RequestInfo) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('sf.eater.com/rss')) {
        return new Response(
          `<?xml version="1.0"?><rss version="2.0"><channel>
            <item>
              <title>New Restaurant Opens in Mission</title>
              <link>https://sf.eater.com/article/123</link>
              <pubDate>${pubDate}</pubDate>
              <description>A new restaurant opens.</description>
            </item>
          </channel></rss>`,
          { status: 200, headers: { 'content-type': 'application/rss+xml' } },
        )
      }
      return new Response('<html><body><h1>New Restaurant</h1></body></html>', { status: 200 })
    }) as typeof fetch
    try {
      setLookupOverrideForTests(publicLookup)
      await assert.rejects(() => fetchEaterSF([]), /OPENAI_API_KEY is required/)
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved
      globalThis.fetch = originalFetch
    }
  })

  it('uses AI-extracted restaurants when client is available', async () => {
    const aiPayload = {
      restaurants: [
        { name: 'AI Bistro', neighborhood: 'Mission', cuisine: 'French', address: '100 Valencia St', opened_date: 'April 2024' },
      ],
    }
    setOpenAIClientForTests({
      chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(aiPayload) } }] }) } },
    })
    setLookupOverrideForTests(publicLookup)
    const originalFetch = globalThis.fetch
    const pubDate = new Date().toUTCString()
    globalThis.fetch = (async (input: string | URL | RequestInfo) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('sf.eater.com/rss')) {
        return new Response(
          `<?xml version="1.0"?><rss version="2.0"><channel>
            <item>
              <title>New Restaurant Opens in Mission</title>
              <link>https://sf.eater.com/article/123</link>
              <pubDate>${pubDate}</pubDate>
              <description>A new restaurant opens.</description>
            </item>
          </channel></rss>`,
          { status: 200, headers: { 'content-type': 'application/rss+xml' } },
        )
      }
      return new Response('<html><body><h1>New Restaurant</h1></body></html>', { status: 200 })
    }) as typeof fetch
    try {
      const results = await fetchEaterSF([])
      const found = results.find((r) => r.name === 'AI Bistro')
      assert.ok(found, 'Expected AI Bistro in results')
      assert.equal(found.neighborhood, 'Mission')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
