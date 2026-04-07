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
  getVisibleRestaurants,
  addRestaurant,
  getRestaurantByIdentityKey,
  getRestaurantByName,
  updateRestaurant,
  deleteRestaurant,
  clearRestaurants,
  getEvents,
  getVisibleEvents,
  addEvent,
  getEventByDedupeKey,
  deleteEvent,
  clearEvents,
  getSubscriptions,
  addSubscription,
  removeSubscription,
  getRecentUpdates,
  recordUpdate,
  getCronRun,
  markCronRun,
  getRestaurantsNeedingMenuCheck,
  updateRestaurantMenu,
} from "./storage.js";
import type { DietaryFlags } from "./storage.js";
import { formatMonthYear, todayUTC } from "../shared/dates.ts";

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

function shiftUtcMonths(reference: Date, months: number): Date {
  return new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth() + months,
      reference.getUTCDate(),
    ),
  );
}

// ── Restaurants ───────────────────────────────────────────────────────────────

describe("storage — restaurants", () => {
  let pool: PgPool;
  const reference = todayUTC();
  const sampleMonth = formatMonthYear(reference);
  const sampleStartDate = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1),
  )
    .toISOString()
    .slice(0, 10);
  const sampleEndDate = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);

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
    opened_date: sampleMonth,
    source_url: "https://example.com",
  };

  it("addRestaurant returns the inserted row with id and added_at", async () => {
    const r = await addRestaurant(sample, pool);
    assert.equal(r.name, sample.name);
    assert.equal(r.neighborhood, sample.neighborhood);
    assert.equal(r.highlight_kind, "opening");
    assert.equal(r.opened_start_date, sampleStartDate);
    assert.equal(r.opened_end_date, sampleEndDate);
    assert.equal(r.opened_date_precision, "month");
    assert.equal(r.is_upcoming, true);
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

  it("getRestaurantByName matches case-insensitively", async () => {
    await clearRestaurants(pool);
    await addRestaurant(sample, pool);
    const r = await getRestaurantByName("test bistro", pool);
    assert.equal(r?.name, sample.name);
  });

  it("getRestaurantByIdentityKey matches normalized name plus address", async () => {
    await clearRestaurants(pool);
    await addRestaurant(sample, pool);
    const r = await getRestaurantByIdentityKey("test bistro|1 mission st", pool);
    assert.equal(r?.name, sample.name);
  });

  it("updateRestaurant can promote a row to Michelin recognition", async () => {
    await clearRestaurants(pool);
    const r = await addRestaurant(sample, pool);
    const updated = await updateRestaurant(
      r.id,
      {
        ...sample,
        cuisine: "Michelin 1-star recognition",
        opened_date: "1 star · August 6, 2024",
        highlight_kind: "michelin",
      },
      pool,
    );

    assert.equal(updated.highlight_kind, "michelin");
    assert.equal(updated.opened_date, "1 star · August 6, 2024");
    assert.equal(updated.opened_start_date, "2024-08-06");
    assert.equal(updated.opened_end_date, "2024-08-06");
  });

  it("addRestaurant upserts on identity_key instead of inserting duplicates", async () => {
    await clearRestaurants(pool);
    await addRestaurant(sample, pool);
    await addRestaurant(
      {
        ...sample,
        cuisine: "Updated French",
      },
      pool,
    );

    const rows = await getRestaurants(pool);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].cuisine, "Updated French");
  });

  it("getVisibleRestaurants keeps recent openings, upcoming spots, and Michelin rows", async () => {
    await clearRestaurants(pool);
    await addRestaurant(
      {
        ...sample,
        name: "Recent",
        opened_date: formatDay(shiftUtcDays(reference, -30)),
      },
      pool,
    );
    await addRestaurant(
      { ...sample, name: "Upcoming", opened_date: "Summer 2026 (upcoming)" },
      pool,
    );
    await addRestaurant(
      {
        ...sample,
        name: "Michelin",
        cuisine: "Michelin 2-star recognition",
        opened_date: "2 stars · June 27, 2025",
        highlight_kind: "michelin",
      },
      pool,
    );
    await addRestaurant(
      {
        ...sample,
        name: "Old",
        opened_date: formatDay(shiftUtcMonths(reference, -4)),
      },
      pool,
    );

    const rows = await getVisibleRestaurants(pool);
    assert.deepEqual(
      rows.map((row) => row.name).sort(),
      ["Michelin", "Recent", "Upcoming"],
    );
  });
});

// ── Events ────────────────────────────────────────────────────────────────────

describe("storage — events", () => {
  let pool: PgPool;
  const reference = todayUTC();
  const sampleDate = formatDay(shiftUtcDays(reference, 4));
  const sampleIsoDate = shiftUtcDays(reference, 4).toISOString().slice(0, 10);

  before(async () => {
    pool = await createTestDb();
    await clearEvents(pool);
  });

  const sample = {
    title: "Test Concert",
    location: "Brick & Mortar",
    date: sampleDate,
    time: "8:00 PM",
    description: "Live music",
    source_url: "https://example.com",
  };

  it("addEvent returns the inserted row with id and added_at", async () => {
    const e = await addEvent(sample, pool);
    assert.equal(e.title, sample.title);
    assert.equal(e.start_date, sampleIsoDate);
    assert.equal(e.end_date, sampleIsoDate);
    assert.equal(e.date_precision, "day");
    assert.equal(
      e.dedupe_key,
      `test concert|brick & mortar|${sampleDate.toLowerCase()}`,
    );
    assert.ok(typeof e.id === "number");
    assert.ok(e.added_at);
  });

  it("getEvents returns rows sorted by parsed date ascending", async () => {
    await clearEvents(pool);
    await addEvent({ ...sample, title: "Late", date: formatDay(shiftUtcDays(reference, 33)) }, pool);
    await addEvent({ ...sample, title: "Soon", date: formatDay(shiftUtcDays(reference, 4)) }, pool);
    await addEvent({ ...sample, title: "Next Year", date: formatDay(shiftUtcDays(reference, 370)) }, pool);

    const rows = await getEvents(pool);
    assert.deepEqual(
      rows.map((row) => row.title),
      ["Soon", "Late", "Next Year"],
    );
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

  it("can look up an event by dedupe key", async () => {
    await clearEvents(pool);
    const e = await addEvent(sample, pool);
    const found = await getEventByDedupeKey(e.dedupe_key, pool);
    assert.equal(found?.id, e.id);
  });

  it("getVisibleEvents excludes past events but keeps upcoming ones", async () => {
    await clearEvents(pool);
    await addEvent({ ...sample, title: "Past", date: formatDay(shiftUtcDays(reference, -10)) }, pool);
    await addEvent({ ...sample, title: "Today", date: formatDay(reference) }, pool);
    await addEvent({ ...sample, title: "Future", date: formatDay(shiftUtcDays(reference, 4)) }, pool);

    const rows = await getVisibleEvents(pool);
    assert.deepEqual(
      rows.map((row) => row.title),
      ["Today", "Future"],
    );
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

describe("storage — cron runs", () => {
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
  });

  it("markCronRun upserts the latest run time", async () => {
    const first = await markCronRun("michelin", pool);
    const second = await markCronRun("michelin", pool);
    assert.equal(first.job_name, "michelin");
    assert.equal(second.job_name, "michelin");
    assert.ok(second.last_ran_at >= first.last_ran_at);
  });

  it("getCronRun returns undefined for unknown jobs", async () => {
    const run = await getCronRun("does-not-exist", pool);
    assert.equal(run, undefined);
  });
});

// ── Menu / dietary ────────────────────────────────────────────────────────────

describe("getRestaurantsNeedingMenuCheck()", () => {
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
  });

  it("returns opened restaurants with no menu_checked_at", async () => {
    const restaurants = await getRestaurantsNeedingMenuCheck(pool);
    assert.ok(restaurants.length > 0);
    for (const r of restaurants) {
      assert.ok(!r.opened_date.toLowerCase().includes("upcoming"),
        `${r.name} should not be 'upcoming'`);
    }
  });

  it("excludes upcoming restaurants", async () => {
    const restaurants = await getRestaurantsNeedingMenuCheck(pool);
    const names = restaurants.map((r: { name: string }) => r.name);
    // "Maillards" is Spring 2026 (upcoming) in seed data
    assert.ok(!names.includes("Maillards"), "should not include upcoming restaurants");
  });
});

describe("updateRestaurantMenu()", () => {
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
  });

  it("sets menu_url, dietary_flags, and menu_checked_at", async () => {
    const restaurants = await getRestaurants(pool);
    const r = restaurants[0];
    const flags: DietaryFlags = {
      gluten_free: { available: true, confidence: "confirmed" },
      vegan: { available: false, confidence: "inferred" },
      vegetarian: { available: true, confidence: "inferred" },
    };
    await updateRestaurantMenu(r.id, "https://example.com/menu", flags, pool);

    const updated = await getRestaurants(pool);
    const u = updated.find((x) => x.id === r.id)!;
    assert.equal(u.menu_url, "https://example.com/menu");
    assert.ok(u.menu_checked_at !== null, "menu_checked_at should be set");
    assert.equal(u.dietary_flags!.gluten_free.available, true);
    assert.equal(u.dietary_flags!.gluten_free.confidence, "confirmed");
  });

  it("sets null menu_url and null dietary_flags", async () => {
    const restaurants = await getRestaurants(pool);
    const r = restaurants[0];
    await updateRestaurantMenu(r.id, null, null, pool);

    const updated = await getRestaurants(pool);
    const u = updated.find((x) => x.id === r.id)!;
    assert.equal(u.menu_url, null);
    assert.equal(u.dietary_flags, null);
    assert.ok(u.menu_checked_at !== null, "menu_checked_at should still be set");
  });
});
