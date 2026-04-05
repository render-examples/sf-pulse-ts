/**
 * Integration tests for server/routes.ts.
 *
 * Stands up the full Express app (via createApp) against a pg-mem database.
 * Tests exercise the complete request → route handler → storage → response
 * path, including auth guards, broadcast side-effects, and error cases.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import type { Pool as PgPool } from "pg";
import { createApp } from "./app.js";
import { createTestDb } from "./test-helpers.js";
import { clearRestaurants, clearEvents, addRestaurant, addEvent } from "./storage.js";

// ── shared fixtures ───────────────────────────────────────────────────────────

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

// ── helpers ───────────────────────────────────────────────────────────────────

function makeAgent(pool: PgPool) {
  const { app } = createApp(pool);
  return supertest(app);
}

// ── GET /api/restaurants ──────────────────────────────────────────────────────

describe("GET /api/restaurants", () => {
  let agent: ReturnType<typeof supertest>;
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
  let agent: ReturnType<typeof supertest>;
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    await clearRestaurants(pool);
    agent = makeAgent(pool);
  });

  it("returns { ok: true } and removes the row", async () => {
    const r = await addRestaurant(restaurant, pool);
    const res = await agent.delete(`/api/restaurants/${r.id}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    const listRes = await agent.get("/api/restaurants");
    assert.ok(!listRes.body.find((x: { id: number }) => x.id === r.id));
  });

  it("returns 200 even for a non-existent id (idempotent DELETE)", async () => {
    const res = await agent.delete("/api/restaurants/999999");
    assert.equal(res.status, 200);
  });
});

// ── GET /api/events ───────────────────────────────────────────────────────────

describe("GET /api/events", () => {
  let agent: ReturnType<typeof supertest>;
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    await clearEvents(pool);
    await addEvent(event, pool);
    agent = makeAgent(pool);
  });

  it("returns 200 with an array", async () => {
    const res = await agent.get("/api/events");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it("returns seeded event with correct shape", async () => {
    const res = await agent.get("/api/events");
    const e = res.body[0];
    assert.equal(e.title, event.title);
    assert.ok(typeof e.id === "number");
  });
});

// ── DELETE /api/events/:id ────────────────────────────────────────────────────

describe("DELETE /api/events/:id", () => {
  let agent: ReturnType<typeof supertest>;
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    await clearEvents(pool);
    agent = makeAgent(pool);
  });

  it("returns { ok: true } and removes the row", async () => {
    const e = await addEvent(event, pool);
    const res = await agent.delete(`/api/events/${e.id}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    const listRes = await agent.get("/api/events");
    assert.ok(!listRes.body.find((x: { id: number }) => x.id === e.id));
  });
});

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
    const secret = "test-secret-xyz";
    process.env.CRON_SECRET = secret;
    try {
      const res = await agent.post("/api/cron/refresh").send({});
      assert.equal(res.status, 401);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it("accepts request when CRON_SECRET header matches", async () => {
    const secret = "test-secret-xyz";
    process.env.CRON_SECRET = secret;
    try {
      const res = await agent
        .post("/api/cron/refresh")
        .set("x-cron-secret", secret)
        .send({});
      assert.equal(res.status, 200);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});

// ── GET /api/push/vapid-key ───────────────────────────────────────────────────

describe("GET /api/push/vapid-key", () => {
  let agent: ReturnType<typeof supertest>;

  before(async () => {
    const pool = await createTestDb();
    agent = makeAgent(pool);
  });

  it("returns a non-empty key string", async () => {
    const res = await agent.get("/api/push/vapid-key");
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.key === "string" && res.body.key.length > 0);
  });
});

// ── POST /api/push/subscribe + /unsubscribe ───────────────────────────────────

describe("push subscription endpoints", () => {
  let agent: ReturnType<typeof supertest>;
  const endpoint = "https://push.example.com/test-sub";
  const keys = { p256dh: "p256key", auth: "authkey" };

  before(async () => {
    const pool = await createTestDb();
    agent = makeAgent(pool);
  });

  it("POST /api/push/subscribe returns the subscription", async () => {
    const res = await agent
      .post("/api/push/subscribe")
      .send({ endpoint, keys });
    assert.equal(res.status, 200);
    assert.equal(res.body.endpoint, endpoint);
  });

  it("POST /api/push/subscribe returns 400 when endpoint is missing", async () => {
    const res = await agent
      .post("/api/push/subscribe")
      .send({ keys });
    assert.equal(res.status, 400);
  });

  it("POST /api/push/subscribe returns 400 when keys are missing", async () => {
    const res = await agent
      .post("/api/push/subscribe")
      .send({ endpoint });
    assert.equal(res.status, 400);
  });

  it("POST /api/push/unsubscribe returns { ok: true }", async () => {
    const res = await agent
      .post("/api/push/unsubscribe")
      .send({ endpoint });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it("POST /api/push/unsubscribe returns 400 when endpoint is missing", async () => {
    const res = await agent.post("/api/push/unsubscribe").send({});
    assert.equal(res.status, 400);
  });
});

// ── GET /api/updates + /api/last-updated ─────────────────────────────────────

describe("GET /api/updates and /api/last-updated", () => {
  let agent: ReturnType<typeof supertest>;
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    agent = makeAgent(pool);
    // Seed one update
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

  it("/api/last-updated returns the most recent occurred_at", async () => {
    const res = await agent.get("/api/last-updated");
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.lastUpdated === "string");
  });
});
