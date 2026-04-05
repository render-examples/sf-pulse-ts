import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import type { Pool as PgPool } from "pg";
import { createApp } from "../app.js";
import { createTestDb } from "../test-helpers.js";
import { clearRestaurants, clearEvents } from "../storage.js";

const restaurant = {
  name: "Route Test Bistro",
  neighborhood: "Mission",
  cuisine: "French",
  address: "1 Test St",
  opened_date: "April 2026",
  source_url: null,
};

const event = {
  title: "Route Test Concert",
  location: "Brick & Mortar",
  date: "April 10, 2026",
  time: "8:00 PM",
  description: "Live music",
  source_url: null,
};

function makeAgent(pool: PgPool) {
  const { app } = createApp(pool);
  return supertest(app);
}

// ── POST /api/cron/refresh ────────────────────────────────────────────────────

describe("POST /api/cron/refresh", () => {
  let agent: ReturnType<typeof supertest>;
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    await clearRestaurants(pool);
    await clearEvents(pool);
    agent = makeAgent(pool);
  });

  it("inserts restaurants and events, returns added names", async () => {
    const res = await agent
      .post("/api/cron/refresh")
      .send({ restaurants: [restaurant], events: [event] });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.added.restaurants, [restaurant.name]);
    assert.deepEqual(res.body.added.events, [event.title]);
  });

  it("inserted rows are visible in GET endpoints", async () => {
    const rRes = await agent.get("/api/restaurants");
    assert.ok(rRes.body.some((r: { name: string }) => r.name === restaurant.name));

    const eRes = await agent.get("/api/events");
    assert.ok(eRes.body.some((e: { title: string }) => e.title === event.title));
  });

  it("records data_updates entries for each inserted item", async () => {
    const res = await agent.get("/api/updates");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some((u: { item_name: string }) => u.item_name === restaurant.name));
    assert.ok(res.body.some((u: { item_name: string }) => u.item_name === event.title));
  });

  it("returns empty added arrays when body is empty", async () => {
    const res = await agent.post("/api/cron/refresh").send({});
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.added, { restaurants: [], events: [] });
  });

  it("returns 401 when CRON_SECRET is set and header is missing", async () => {
    process.env.CRON_SECRET = "test-secret-xyz";
    try {
      const res = await agent.post("/api/cron/refresh").send({});
      assert.equal(res.status, 401);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it("accepts request when CRON_SECRET header matches", async () => {
    process.env.CRON_SECRET = "test-secret-xyz";
    try {
      const res = await agent
        .post("/api/cron/refresh")
        .set("x-cron-secret", "test-secret-xyz")
        .send({});
      assert.equal(res.status, 200);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});
