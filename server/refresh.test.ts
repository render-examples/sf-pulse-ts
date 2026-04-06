import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { Pool as PgPool } from "pg";
import { applyDiscoveredItems } from "./refresh.js";
import { createTestDb } from "./test-helpers.js";
import {
  clearEvents,
  clearRestaurants,
  getEvents,
  getRecentUpdates,
  getRestaurants,
} from "./storage.js";

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

describe("applyDiscoveredItems()", () => {
  let pool: PgPool;

  before(async () => {
    pool = await createTestDb();
    await clearRestaurants(pool);
    await clearEvents(pool);
  });

  it("inserts restaurants and events, returns added names", async () => {
    const result = await applyDiscoveredItems(
      { restaurants: [restaurant], events: [event] },
      pool,
    );

    assert.deepEqual(result.added.restaurants, [restaurant.name]);
    assert.deepEqual(result.added.events, [event.title]);
  });

  it("inserted rows are visible in storage", async () => {
    const restaurants = await getRestaurants(pool);
    const events = await getEvents(pool);

    assert.ok(restaurants.some((r) => r.name === restaurant.name));
    assert.ok(events.some((e) => e.title === event.title));
  });

  it("records data_updates entries for each inserted item", async () => {
    const updates = await getRecentUpdates(10, pool);

    assert.ok(updates.some((u) => u.item_name === restaurant.name));
    assert.ok(updates.some((u) => u.item_name === event.title));
  });

  it("returns empty added arrays when input is empty", async () => {
    const result = await applyDiscoveredItems({}, pool);

    assert.deepEqual(result.added, { restaurants: [], events: [] });
  });
});
