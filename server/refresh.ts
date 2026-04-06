import type { Pool } from "pg";
import webpush from "web-push";
import type { Event, NewRestaurant } from "./storage.js";
import * as storage from "./storage.js";
import { broadcast } from "./sse.js";

const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BBkwZRCOJzKrYlx_-1XEbGaNmgofTxAaaIRWZzEx8MrA-C52lj6uP4Qv3Eheq3l_2GWXDNZltVpprFNG1N1QAG4";
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "tjnOZ1tYY6cLxXallojS1TP7iVIopu4ogMD6XIePbsI";

webpush.setVapidDetails(
  "mailto:sf-pulse@example.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export interface ApplyDiscoveredItemsInput {
  restaurants?: NewRestaurant[];
  events?: Array<Omit<Event, "id" | "added_at">>;
}

export interface ApplyDiscoveredItemsResult {
  added: {
    restaurants: string[];
    events: string[];
  };
}

async function pushToAll(
  title: string,
  body: string,
  pool?: Pool,
): Promise<void> {
  const subs = await storage.getSubscriptions(pool);
  const sends = subs.map((sub) =>
    webpush
      .sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title, body }),
      )
      .catch(() => {
        storage.removeSubscription(sub.endpoint, pool);
      }),
  );
  await Promise.allSettled(sends);
}

export async function applyDiscoveredItems(
  { restaurants = [], events = [] }: ApplyDiscoveredItemsInput,
  pool?: Pool,
): Promise<ApplyDiscoveredItemsResult> {
  const newRestaurants: string[] = [];
  const newEvents: string[] = [];

  for (const restaurant of restaurants) {
    const added = await storage.addRestaurant(restaurant, pool);
    await storage.recordUpdate("restaurant", added.name, "added", pool);
    newRestaurants.push(added.name);
  }

  for (const event of events) {
    const added = await storage.addEvent(event, pool);
    await storage.recordUpdate("event", added.title, "added", pool);
    newEvents.push(added.title);
  }

  if (newRestaurants.length > 0 || newEvents.length > 0) {
    broadcast("restaurants", { action: "refresh" });
    broadcast("events", { action: "refresh" });

    const lines: string[] = [];
    if (newRestaurants.length) {
      lines.push(
        `${newRestaurants.length} new restaurant${newRestaurants.length > 1 ? "s" : ""}: ${newRestaurants.join(", ")}`,
      );
    }
    if (newEvents.length) {
      lines.push(
        `${newEvents.length} new event${newEvents.length > 1 ? "s" : ""}: ${newEvents.join(", ")}`,
      );
    }

    await pushToAll("SF Pulse update", lines.join(" · "), pool);
  }

  return { added: { restaurants: newRestaurants, events: newEvents } };
}
