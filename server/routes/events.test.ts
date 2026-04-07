import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Pool as PgPool } from "pg";
import { createApp } from "../app.js";
import { makeRequestAgent, type RequestAgent } from "../test-agent.js";
import { createTestDb } from "../test-helpers.js";
import { clearEvents, addEvent } from "../storage.js";
import { todayUTC } from "../../shared/dates.ts";

function formatDay(value: Date): string {
  return value.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftUtcDays(reference: Date, days: number): Date {
  return new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate() + days,
    ),
  );
}

const reference = todayUTC();

const event = {
  title: "Route Test Concert",
  location: "Brick & Mortar",
  date: formatDay(shiftUtcDays(reference, 4)),
  time: "8:00 PM",
  description: "Live music",
  source_url: null,
};
const cronSecret = "test-secret";

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

  it("includes past events in the response", async () => {
    await addEvent(
      { ...event, title: "Already Happened", date: formatDay(shiftUtcDays(reference, -10)) },
      pool,
    );

    const res = await agent.get("/api/events");
    assert.ok(res.body.some((row: { title: string }) => row.title === "Already Happened"));
  });
});

// ── DELETE /api/events/:id ────────────────────────────────────────────────────

describe("DELETE /api/events/:id", () => {
  let agent: RequestAgent;
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    await clearEvents(pool);
    process.env.CRON_SECRET = cronSecret;
    agent = makeAgent(pool);
  });

  after(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns { ok: true } and removes the row", async () => {
    const e = await addEvent(event, pool);
    const res = await agent
      .delete(`/api/events/${e.id}`)
      .set("x-cron-secret", cronSecret);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    const listRes = await agent.get("/api/events");
    assert.ok(!listRes.body.find((x: { id: number }) => x.id === e.id));
  });

  it("rejects requests without cron secret", async () => {
    const res = await agent.delete("/api/events/999999");
    assert.equal(res.status, 401);
  });
});
