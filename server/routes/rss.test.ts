import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { Pool as PgPool } from "pg";
import { createApp } from "../app.js";
import { makeRequestAgent, type RequestAgent } from "../test-agent.js";
import { createTestDb } from "../test-helpers.js";
import { addRestaurant, addEvent } from "../storage.js";

function makeAgent(pool: PgPool) {
  const { app } = createApp(pool);
  return makeRequestAgent(app);
}

describe("GET /api/rss.xml", () => {
  let agent: RequestAgent;

  before(async () => {
    const pool = await createTestDb();
    await addRestaurant(
      {
        name: "RSS Bistro",
        neighborhood: "Mission",
        cuisine: "French",
        address: "1 RSS St",
        opened_date: "January 2026",
        source_url: "https://example.com/rss-bistro",
      },
      pool
    );
    await addEvent(
      {
        title: "RSS Concert",
        location: "Brick & Mortar",
        date: "February 1, 2026",
        time: "8pm",
        description: "Live music",
        source_url: null,
      },
      pool
    );
    agent = makeAgent(pool);
  });

  it("returns 200 with RSS content-type", async () => {
    const res = await agent.get("/api/rss.xml");
    assert.equal(res.status, 200);
    assert.ok(
      res.headers["content-type"]?.includes("application/rss+xml"),
      `expected rss+xml, got ${res.headers["content-type"]}`
    );
  });

  it("contains valid RSS 2.0 root element", async () => {
    const res = await agent.get("/api/rss.xml");
    assert.ok(res.text.includes('version="2.0"'), "should have rss version=2.0");
    assert.ok(res.text.includes("<channel>"), "should have <channel>");
    assert.ok(res.text.includes("</rss>"), "should close </rss>");
  });

  it("includes the seeded restaurant as an item", async () => {
    const res = await agent.get("/api/rss.xml");
    assert.ok(res.text.includes("RSS Bistro"), "should include restaurant name");
    assert.ok(res.text.includes("New restaurant:"), "should have restaurant item prefix");
  });

  it("includes the seeded event as an item", async () => {
    const res = await agent.get("/api/rss.xml");
    assert.ok(res.text.includes("RSS Concert"), "should include event title");
  });

  it("escapes special characters in titles", async () => {
    const pool = await createTestDb();
    const a = makeAgent(pool);
    await addRestaurant(
      {
        name: "Caf\u00e9 & Bar <Bistro>",
        neighborhood: "Mission",
        cuisine: "French",
        address: "1 Test St",
        opened_date: "Jan 2026",
        source_url: null,
      },
      pool
    );
    const res = await a.get("/api/rss.xml");
    assert.ok(res.text.includes("Caf\u00e9 &amp; Bar &lt;Bistro&gt;"), "should escape & and <>");
  });

  it("includes atom:link self-reference", async () => {
    const res = await agent.get("/api/rss.xml");
    assert.ok(res.text.includes("rel=\"self\""), "should have atom self link");
    assert.ok(res.text.includes("/api/rss.xml"), "self link should point to the feed URL");
  });
});
