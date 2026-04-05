/**
 * Tests for server/storage.ts
 *
 * Each describe block gets a fresh pg-mem database with the full schema
 * applied, so tests are fully isolated from each other and from production.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { Pool as PgPool } from "pg";
import { createTestDb } from "./test-helpers.js";
import {
  getRestaurants,
  addRestaurant,
  deleteRestaurant,
  clearRestaurants,
  getEvents,
  addEvent,
  deleteEvent,
  clearEvents,
  getSubscriptions,
  addSubscription,
  removeSubscription,
  getRecentUpdates,
  recordUpdate,
} from "./storage.js";

// ── Restaurants ───────────────────────────────────────────────────────────────

describe("storage — restaurants", () => {
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    // Clear seed data so tests start from a known empty state
    await clearRestaurants(pool);
  });

  const sample = {
    name: "Test Bistro",
    neighborhood: "Mission",
    cuisine: "French",
    address: "1 Mission St",
    opened_date: "April 2026",
    source_url: "https://example.com",
  };

  it("addRestaurant returns the inserted row with id and added_at", async () => {
    const r = await addRestaurant(sample, pool);
    assert.equal(r.name, sample.name);
    assert.equal(r.neighborhood, sample.neighborhood);
    assert.ok(typeof r.id === "number");
    assert.ok(r.added_at);
  });

  it("getRestaurants returns all rows ordered by added_at DESC", async () => {
    const rows = await getRestaurants(pool);
    assert.ok(rows.length >= 1);
    // added_at should be descending
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].added_at >= rows[i].added_at);
    }
  });

  it("deleteRestaurant removes the row by id", async () => {
    const r = await addRestaurant({ ...sample, name: "To Delete" }, pool);
    await deleteRestaurant(r.id, pool);
    const rows = await getRestaurants(pool);
    assert.ok(!rows.find((x) => x.id === r.id));
  });

  it("clearRestaurants removes all rows", async () => {
    await addRestaurant(sample, pool);
    await clearRestaurants(pool);
    const rows = await getRestaurants(pool);
    assert.equal(rows.length, 0);
  });

  it("addRestaurant handles null address and source_url", async () => {
    await clearRestaurants(pool);
    const r = await addRestaurant(
      { ...sample, address: null, source_url: null },
      pool
    );
    assert.equal(r.address, null);
    assert.equal(r.source_url, null);
  });
});

// ── Events ────────────────────────────────────────────────────────────────────

describe("storage — events", () => {
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    await clearEvents(pool);
  });

  const sample = {
    title: "Test Concert",
    location: "Brick & Mortar",
    date: "April 10, 2026",
    time: "8:00 PM",
    description: "Live music",
    source_url: "https://example.com",
  };

  it("addEvent returns the inserted row with id and added_at", async () => {
    const e = await addEvent(sample, pool);
    assert.equal(e.title, sample.title);
    assert.ok(typeof e.id === "number");
    assert.ok(e.added_at);
  });

  it("getEvents returns all rows ordered by added_at DESC", async () => {
    const rows = await getEvents(pool);
    assert.ok(rows.length >= 1);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].added_at >= rows[i].added_at);
    }
  });

  it("deleteEvent removes the row by id", async () => {
    const e = await addEvent({ ...sample, title: "To Delete" }, pool);
    await deleteEvent(e.id, pool);
    const rows = await getEvents(pool);
    assert.ok(!rows.find((x) => x.id === e.id));
  });

  it("clearEvents removes all rows", async () => {
    await addEvent(sample, pool);
    await clearEvents(pool);
    assert.equal((await getEvents(pool)).length, 0);
  });

  it("addEvent handles null time, description, source_url", async () => {
    await clearEvents(pool);
    const e = await addEvent(
      { ...sample, time: null, description: null, source_url: null },
      pool
    );
    assert.equal(e.time, null);
    assert.equal(e.description, null);
    assert.equal(e.source_url, null);
  });
});

// ── Push subscriptions ────────────────────────────────────────────────────────

describe("storage — push subscriptions", () => {
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
  });

  const endpoint = "https://push.example.com/sub/abc123";
  const keys = { p256dh: "key1", auth: "auth1" };

  it("addSubscription inserts and returns the row", async () => {
    const sub = await addSubscription(endpoint, keys, pool);
    assert.equal(sub.endpoint, endpoint);
    assert.ok(sub.id);
  });

  it("addSubscription is idempotent — upserts on duplicate endpoint", async () => {
    const newKeys = { p256dh: "key2", auth: "auth2" };
    const sub = await addSubscription(endpoint, newKeys, pool);
    assert.deepEqual(sub.keys, newKeys);
    const all = await getSubscriptions(pool);
    assert.equal(all.filter((s) => s.endpoint === endpoint).length, 1);
  });

  it("removeSubscription deletes the row", async () => {
    await removeSubscription(endpoint, pool);
    const all = await getSubscriptions(pool);
    assert.ok(!all.find((s) => s.endpoint === endpoint));
  });
});

// ── Data updates ──────────────────────────────────────────────────────────────

describe("storage — data updates", () => {
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
  });

  it("recordUpdate inserts and returns the row", async () => {
    const u = await recordUpdate("restaurant", "Test Bistro", "added", pool);
    assert.equal(u.type, "restaurant");
    assert.equal(u.item_name, "Test Bistro");
    assert.equal(u.action, "added");
    assert.ok(u.occurred_at);
  });

  it("getRecentUpdates returns rows ordered by occurred_at DESC, respects limit", async () => {
    await recordUpdate("event", "A", "added", pool);
    await recordUpdate("event", "B", "added", pool);
    const rows = await getRecentUpdates(2, pool);
    assert.equal(rows.length, 2);
    assert.ok(rows[0].occurred_at >= rows[1].occurred_at);
  });
});
