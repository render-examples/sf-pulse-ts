import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { Pool as PgPool } from "pg";
import { createApp } from "../app.js";
import { makeRequestAgent, type RequestAgent } from "../test-agent.js";
import { createTestDb } from "../test-helpers.js";
import { clearEvents, addEvent } from "../storage.js";

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
  return makeRequestAgent(app);
}

// ── GET /api/events ───────────────────────────────────────────────────────────

describe("GET /api/events", () => {
  let agent: RequestAgent;
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
  let agent: RequestAgent;
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
