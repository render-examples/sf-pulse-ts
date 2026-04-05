import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Pool as PgPool } from "pg";
import { createApp } from "../app.js";
import { makeRequestAgent, type RequestAgent } from "../test-agent.js";
import { createTestDb } from "../test-helpers.js";
import { clearRestaurants, addRestaurant } from "../storage.js";

const restaurant = {
  name: "Route Test Bistro",
  neighborhood: "Mission",
  cuisine: "French",
  address: "1 Test St",
  opened_date: "April 2026",
  source_url: null,
};
const cronSecret = "test-secret";

function makeAgent(pool: PgPool) {
  const { app } = createApp(pool);
  return makeRequestAgent(app);
}

// ── GET /api/restaurants ──────────────────────────────────────────────────────

describe("GET /api/restaurants", () => {
  let agent: RequestAgent;
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    await clearRestaurants(pool);
    await addRestaurant(restaurant, pool);
    agent = makeAgent(pool);
  });

  it("returns 200 with an array", async () => {
    const res = await agent.get("/api/restaurants");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it("returns seeded restaurant with correct shape", async () => {
    const res = await agent.get("/api/restaurants");
    const r = res.body[0];
    assert.equal(r.name, restaurant.name);
    assert.equal(r.neighborhood, restaurant.neighborhood);
    assert.ok(typeof r.id === "number");
    assert.ok(r.added_at);
  });
});

// ── DELETE /api/restaurants/:id ───────────────────────────────────────────────

describe("DELETE /api/restaurants/:id", () => {
  let agent: RequestAgent;
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    await clearRestaurants(pool);
    process.env.CRON_SECRET = cronSecret;
    agent = makeAgent(pool);
  });

  after(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns { ok: true } and removes the row", async () => {
    const r = await addRestaurant(restaurant, pool);
    const res = await agent
      .delete(`/api/restaurants/${r.id}`)
      .set("x-cron-secret", cronSecret);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    const listRes = await agent.get("/api/restaurants");
    assert.ok(!listRes.body.find((x: { id: number }) => x.id === r.id));
  });

  it("returns 200 even for a non-existent id (idempotent DELETE)", async () => {
    const res = await agent
      .delete("/api/restaurants/999999")
      .set("x-cron-secret", cronSecret);
    assert.equal(res.status, 200);
  });

  it("rejects requests without cron secret", async () => {
    const res = await agent.delete("/api/restaurants/999999");
    assert.equal(res.status, 401);
  });
});

// ── GET /api/restaurants/needing-menu-check ───────────────────────────────────

describe("GET /api/restaurants/needing-menu-check", () => {
  let agent: RequestAgent;
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    process.env.CRON_SECRET = cronSecret;
    agent = makeAgent(pool);
  });

  after(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns restaurants without 'upcoming' that have no menu_checked_at", async () => {
    const res = await agent
      .get("/api/restaurants/needing-menu-check")
      .set("x-cron-secret", cronSecret);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const names = res.body.map((r: { name: string }) => r.name);
    assert.ok(names.length > 0, "should return some restaurants");
    const upcomingRes = await pool.query(
      "SELECT name FROM restaurants WHERE opened_date ILIKE '%upcoming%'"
    );
    const upcomingNames = upcomingRes.rows.map((r: { name: string }) => r.name);
    for (const name of upcomingNames) {
      assert.ok(!names.includes(name), `${name} should not be in menu check list`);
    }
  });

  it("rejects requests without cron secret", async () => {
    const res = await agent.get("/api/restaurants/needing-menu-check");
    assert.equal(res.status, 401);
  });
});

// ── PUT /api/restaurants/:id/menu ─────────────────────────────────────────────

describe("PUT /api/restaurants/:id/menu", () => {
  let agent: RequestAgent;
  let pool: PgPool;
  let restaurantId: number;

  before(async () => {
    pool = await createTestDb();
    process.env.CRON_SECRET = cronSecret;
    agent = makeAgent(pool);
    const { rows } = await pool.query("SELECT id FROM restaurants LIMIT 1");
    restaurantId = rows[0].id;
  });

  after(() => {
    delete process.env.CRON_SECRET;
  });

  it("updates menu_url and dietary_flags", async () => {
    const flags = {
      gluten_free: { available: true, confidence: "confirmed" },
      vegan: { available: false, confidence: "inferred" },
      vegetarian: { available: true, confidence: "inferred" },
    };
    const res = await agent
      .put(`/api/restaurants/${restaurantId}/menu`)
      .set("x-cron-secret", cronSecret)
      .send({ menuUrl: "https://example.com/menu", dietaryFlags: flags });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    const check = await pool.query(
      "SELECT menu_url, dietary_flags, menu_checked_at FROM restaurants WHERE id = $1",
      [restaurantId]
    );
    assert.equal(check.rows[0].menu_url, "https://example.com/menu");
    assert.ok(check.rows[0].menu_checked_at !== null, "menu_checked_at should be set");
    const storedFlags = check.rows[0].dietary_flags;
    assert.equal(storedFlags.gluten_free.available, true);
    assert.equal(storedFlags.gluten_free.confidence, "confirmed");
  });

  it("menu fields appear in GET /api/restaurants response", async () => {
    const res = await agent.get("/api/restaurants");
    const r = res.body.find((r: { id: number }) => r.id === restaurantId);
    assert.ok(r, "restaurant should be in list");
    assert.equal(r.menu_url, "https://example.com/menu");
    assert.ok(r.dietary_flags !== null);
    assert.equal(r.dietary_flags.gluten_free.available, true);
  });

  it("rejects requests without cron secret", async () => {
    const res = await agent
      .put(`/api/restaurants/${restaurantId}/menu`)
      .send({ menuUrl: null, dietaryFlags: null });
    assert.equal(res.status, 401);
  });
});
