import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Pool as PgPool } from "pg";
import { createApp } from "../app.js";
import { makeRequestAgent, type RequestAgent } from "../test-agent.js";
import { createTestDb } from "../test-helpers.js";
import { clearRestaurants, addRestaurant } from "../storage.js";
import { formatMonthYear, todayUTC } from "../../shared/dates.ts";

function shiftUtcMonths(reference: Date, months: number): Date {
  return new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth() + months,
      reference.getUTCDate(),
    ),
  );
}

function formatDay(value: Date): string {
  return value.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const reference = todayUTC();

const restaurant = {
  name: "Route Test Bistro",
  neighborhood: "Mission",
  cuisine: "French",
  address: "1 Test St",
  opened_date: formatMonthYear(reference),
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

  it("filters out stale non-Michelin restaurants", async () => {
    await addRestaurant(
      {
        ...restaurant,
        name: "Old News",
        opened_date: formatDay(shiftUtcMonths(reference, -4)),
      },
      pool,
    );

    const res = await agent.get("/api/restaurants");
    assert.ok(!res.body.some((row: { name: string }) => row.name === "Old News"));
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
