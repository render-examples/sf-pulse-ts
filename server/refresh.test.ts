import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Pool as PgPool } from "pg";
import webpush from "web-push";
import { applyDiscoveredItems } from "./refresh.js";
import { createTestDb } from "./test-helpers.js";
import {
  addSubscription,
  clearEvents,
  clearRestaurants,
  getEvents,
  getRecentUpdates,
  getRestaurants,
  getSubscriptions,
  removeSubscription,
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
  const originalSendNotification = webpush.sendNotification;
  const originalSetVapidDetails = webpush.setVapidDetails;
  const originalPublicKey = process.env.VAPID_PUBLIC_KEY;
  const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;

  async function clearSubscriptions(): Promise<void> {
    const subs = await getSubscriptions(pool);
    await Promise.all(subs.map((sub) => removeSubscription(sub.endpoint, pool)));
  }

  before(async () => {
    process.env.VAPID_PUBLIC_KEY = "test-vapid-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-vapid-private-key";
    webpush.setVapidDetails = (() => undefined) as typeof webpush.setVapidDetails;
    pool = await createTestDb();
    await clearRestaurants(pool);
    await clearEvents(pool);
    await clearSubscriptions();
  });

  after(() => {
    webpush.sendNotification = originalSendNotification;
    webpush.setVapidDetails = originalSetVapidDetails;
    if (originalPublicKey === undefined) {
      delete process.env.VAPID_PUBLIC_KEY;
    } else {
      process.env.VAPID_PUBLIC_KEY = originalPublicKey;
    }
    if (originalPrivateKey === undefined) {
      delete process.env.VAPID_PRIVATE_KEY;
    } else {
      process.env.VAPID_PRIVATE_KEY = originalPrivateKey;
    }
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

  it("allows same-titled events on different dates", async () => {
    await clearEvents(pool);

    await applyDiscoveredItems(
      {
        events: [
          event,
          { ...event, date: "April 11, 2026" },
        ],
      },
      pool,
    );

    const events = await getEvents(pool);
    assert.equal(events.length, 2);
    assert.deepEqual(
      events.map((entry) => entry.date),
      ["April 10, 2026", "April 11, 2026"],
    );
  });

  it("returns empty added arrays when input is empty", async () => {
    const result = await applyDiscoveredItems({}, pool);

    assert.deepEqual(result.added, { restaurants: [], events: [] });
    assert.deepEqual(result.updated, { restaurants: [] });
  });

  it("ignores blocked restaurant names", async () => {
    await clearRestaurants(pool);

    const result = await applyDiscoveredItems(
      {
        restaurants: [
          {
            ...restaurant,
            name: "Insider tip",
          },
        ],
      },
      pool,
    );

    assert.deepEqual(result.added.restaurants, []);
    assert.equal((await getRestaurants(pool)).length, 0);
  });

  it("updates an existing restaurant when Michelin recognition arrives", async () => {
    await clearRestaurants(pool);
    await applyDiscoveredItems({ restaurants: [restaurant] }, pool);

    const result = await applyDiscoveredItems(
      {
        restaurants: [
          {
            ...restaurant,
            cuisine: "Michelin 1-star recognition",
            opened_date: "1 star · August 6, 2024",
            highlight_kind: "michelin",
            source_url: "https://www.michelin.com/en/publications/products-and-services/michelin-guide-california-2024-selection",
          },
        ],
      },
      pool,
    );

    const restaurants = await getRestaurants(pool);
    assert.equal(restaurants.length, 1);
    assert.equal(restaurants[0].highlight_kind, "michelin");
    assert.deepEqual(result.updated.restaurants, [restaurant.name]);
  });

  it("updates an existing event when incoming data is more specific", async () => {
    await clearEvents(pool);
    await applyDiscoveredItems(
      {
        events: [
          {
            ...event,
            location: "San Francisco",
            date: "April 10",
            description: "The post Route Test Concert appeared first on Funcheap .",
            source_url: "https://example.com/route-test-concert",
          },
        ],
      },
      pool,
    );

    await applyDiscoveredItems({ events: [event] }, pool);

    const events = await getEvents(pool);
    assert.equal(events.length, 1);
    assert.equal(events[0].location, event.location);
    assert.equal(events[0].date, event.date);
    assert.equal(events[0].description, event.description);
  });

  it("keeps distinct rows when restaurants share a name but not an identity", async () => {
    await clearRestaurants(pool);

    await applyDiscoveredItems(
      {
        restaurants: [
          restaurant,
          {
            ...restaurant,
            address: "99 Another St",
            source_url: "https://example.com/other-location",
          },
        ],
      },
      pool,
    );

    const restaurants = await getRestaurants(pool);
    assert.equal(restaurants.length, 2);
    assert.deepEqual(
      restaurants.map((entry) => entry.address).sort(),
      ["1 Test St", "99 Another St"],
    );
  });

  it("sends push notifications for new discoveries", async () => {
    await clearRestaurants(pool);
    await clearEvents(pool);
    await clearSubscriptions();
    await addSubscription(
      "https://fcm.googleapis.com/fcm/send/subscription",
      { p256dh: "p256", auth: "auth" },
      pool,
    );

    const notifications: Array<{ title: string; body: string }> = [];
    webpush.sendNotification = (async (_subscription, payload) => {
      notifications.push(JSON.parse(String(payload)));
      return {} as never;
    }) as typeof webpush.sendNotification;

    await applyDiscoveredItems(
      { restaurants: [restaurant], events: [event] },
      pool,
    );

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].title, "SF Pulse update");
    assert.match(notifications[0].body, /Route Test Bistro/);
    assert.match(notifications[0].body, /Route Test Concert/);
  });

  it("drops untrusted stored subscriptions before sending notifications", async () => {
    await clearRestaurants(pool);
    await clearEvents(pool);
    await clearSubscriptions();
    await addSubscription(
      "https://fcm.googleapis.com/fcm/send/valid-subscription",
      { p256dh: "p256", auth: "auth" },
      pool,
    );
    await addSubscription(
      "https://attacker.example.com/push",
      { p256dh: "p256", auth: "auth" },
      pool,
    );

    const endpoints: string[] = [];
    webpush.sendNotification = (async (subscription) => {
      endpoints.push(String(subscription.endpoint));
      return {} as never;
    }) as typeof webpush.sendNotification;

    await applyDiscoveredItems({ restaurants: [restaurant] }, pool);

    assert.deepEqual(endpoints, ["https://fcm.googleapis.com/fcm/send/valid-subscription"]);
    const subs = await getSubscriptions(pool);
    assert.ok(!subs.some((sub) => sub.endpoint === "https://attacker.example.com/push"));
  });

  it("sends notifications only to subscriptions whose preferences match", async () => {
    await clearRestaurants(pool);
    await clearEvents(pool);
    await clearSubscriptions();
    await addSubscription(
      "https://fcm.googleapis.com/fcm/send/mission-subscription",
      { p256dh: "p256", auth: "auth" },
      {
        neighborhoods: ["Mission"],
        cuisines: [],
        event_categories: [],
      },
      pool,
    );
    await addSubscription(
      "https://fcm.googleapis.com/fcm/send/sunset-subscription",
      { p256dh: "p256", auth: "auth" },
      {
        neighborhoods: ["Sunset"],
        cuisines: [],
        event_categories: [],
      },
      pool,
    );

    const endpoints: string[] = [];
    webpush.sendNotification = (async (subscription) => {
      endpoints.push(String(subscription.endpoint));
      return {} as never;
    }) as typeof webpush.sendNotification;

    await applyDiscoveredItems({ restaurants: [restaurant], events: [event] }, pool);

    assert.deepEqual(endpoints, ["https://fcm.googleapis.com/fcm/send/mission-subscription"]);
  });
});
