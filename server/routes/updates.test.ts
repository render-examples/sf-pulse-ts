import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { Pool as PgPool } from "pg";
import { createApp } from "../app.js";
import { makeRequestAgent, type RequestAgent } from "../test-agent.js";
import { createTestDb } from "../test-helpers.js";

const restaurant = {
  name: "Route Test Bistro",
  neighborhood: "Mission",
  cuisine: "French",
  address: "1 Test St",
  opened_date: "April 2026",
  source_url: null,
};

function makeAgent(pool: PgPool) {
  const { app } = createApp(pool);
  return makeRequestAgent(app);
}

// ── GET /api/updates + /api/updates/last-updated ──────────────────────────────

describe("GET /api/updates and /api/updates/last-updated", () => {
  let agent: RequestAgent;
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    agent = makeAgent(pool);
    // Seed one update via the cron endpoint
    await agent.post("/api/cron/refresh").send({ restaurants: [restaurant] });
  });

  it("/api/updates returns an array of update records", async () => {
    const res = await agent.get("/api/updates");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const u = res.body[0];
    assert.ok(u.type);
    assert.ok(u.item_name);
    assert.ok(u.action);
    assert.ok(u.occurred_at);
  });

  it("/api/updates/last-updated returns the most recent occurred_at", async () => {
    const res = await agent.get("/api/updates/last-updated");
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.lastUpdated === "string");
  });
});
