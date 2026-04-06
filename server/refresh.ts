import type { Pool } from "pg";
import webpush from "web-push";
import type { NewEvent, NewRestaurant } from "./storage.js";
import * as storage from "./storage.js";
import { getVapidConfig, isTrustedPushEndpoint } from "./security.js";
import { broadcast } from "./sse.js";
import { buildEventIdentityKey } from "../shared/event-identity.ts";
import { normalizeDateText } from "../shared/dates.ts";

export interface ApplyDiscoveredItemsInput {
  restaurants?: NewRestaurant[];
  events?: NewEvent[];
}

export interface ApplyDiscoveredItemsResult {
  added: {
    restaurants: string[];
    events: string[];
  };
  updated: {
    restaurants: string[];
  };
}

async function pushToAll(
  title: string,
  body: string,
  pool?: Pool,
): Promise<void> {
  try {
    const vapid = getVapidConfig();
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  } catch (error) {
    console.warn(`[push] notifications disabled: ${(error as Error).message}`);
    return;
  }

  const subs = await storage.getSubscriptions(pool);
  const sends = subs.map(async (sub) => {
    if (!isTrustedPushEndpoint(sub.endpoint)) {
      await storage.removeSubscription(sub.endpoint, pool);
      return;
    }

    return webpush
      .sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title, body }),
      )
      .catch(() => {
        storage.removeSubscription(sub.endpoint, pool);
      });
  });
  await Promise.allSettled(sends);
}

export async function applyDiscoveredItems(
  { restaurants = [], events = [] }: ApplyDiscoveredItemsInput,
  pool?: Pool,
): Promise<ApplyDiscoveredItemsResult> {
  const newRestaurants: string[] = [];
  const newEvents: string[] = [];
  const updatedRestaurants: string[] = [];

  for (const restaurant of restaurants) {
    const existing = await storage.getRestaurantByName(restaurant.name, pool);
    if (existing) {
      if (restaurant.highlight_kind === "michelin") {
        const nextKind = restaurant.highlight_kind ?? "opening";
        const changed =
          existing.highlight_kind !== nextKind ||
          existing.opened_date !== restaurant.opened_date ||
          existing.source_url !== (restaurant.source_url ?? null) ||
          existing.cuisine !== restaurant.cuisine ||
          existing.neighborhood !== restaurant.neighborhood ||
          existing.address !== (restaurant.address ?? null);

        if (changed) {
          await storage.updateRestaurant(existing.id, restaurant, pool);
          await storage.recordUpdate("restaurant", existing.name, "updated", pool);
          updatedRestaurants.push(existing.name);
        }
      }
      continue;
    }

    const added = await storage.addRestaurant(restaurant, pool);
    await storage.recordUpdate("restaurant", added.name, "added", pool);
    newRestaurants.push(added.name);
  }

  for (const event of events) {
    const existing = await storage.getEventByDedupeKey(
      buildEventIdentityKey({
        title: event.title,
        location: event.location,
        dateText: normalizeDateText(event.date),
      }),
      pool,
    );
    if (existing) {
      continue;
    }

    const added = await storage.addEvent(event, pool);
    await storage.recordUpdate("event", added.title, "added", pool);
    newEvents.push(added.title);
  }

  if (newRestaurants.length > 0 || updatedRestaurants.length > 0 || newEvents.length > 0) {
    await broadcast("restaurants", { action: "refresh" });
    await broadcast("events", { action: "refresh" });

    const lines: string[] = [];
    if (newRestaurants.length) {
      lines.push(
        `${newRestaurants.length} new restaurant${newRestaurants.length > 1 ? "s" : ""}: ${newRestaurants.join(", ")}`,
      );
    }
    if (updatedRestaurants.length) {
      lines.push(
        `${updatedRestaurants.length} updated restaurant${updatedRestaurants.length > 1 ? "s" : ""}: ${updatedRestaurants.join(", ")}`,
      );
    }
    if (newEvents.length) {
      lines.push(
        `${newEvents.length} new event${newEvents.length > 1 ? "s" : ""}: ${newEvents.join(", ")}`,
      );
    }

    await pushToAll("SF Pulse update", lines.join(" · "), pool);
  }

  return {
    added: { restaurants: newRestaurants, events: newEvents },
    updated: { restaurants: updatedRestaurants },
  };
}
