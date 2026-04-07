import type { Pool } from "pg";
import webpush from "web-push";
import type { NewEvent, NewRestaurant } from "./storage.js";
import * as storage from "./storage.js";
import { getVapidConfig, isTrustedPushEndpoint } from "./security.js";
import { broadcast } from "./sse.js";
import { buildEventIdentityKey } from "../shared/event-identity.ts";
import { buildRestaurantIdentityKey } from "../shared/restaurant-identity.ts";
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

function mergeRestaurantForUpsert(
  incoming: NewRestaurant,
  existing?: storage.Restaurant,
): NewRestaurant {
  const nextKind = incoming.highlight_kind ?? existing?.highlight_kind ?? "opening";
  const incomingNeighborhood = incoming.neighborhood.trim();
  const keepExistingNeighborhood =
    nextKind === "michelin" &&
    incomingNeighborhood.toLowerCase() === "san francisco" &&
    Boolean(existing?.neighborhood);

  return {
    ...incoming,
    neighborhood: keepExistingNeighborhood
      ? (existing?.neighborhood ?? incoming.neighborhood)
      : incoming.neighborhood,
    address: incoming.address ?? existing?.address ?? null,
    source_url: incoming.source_url ?? existing?.source_url ?? null,
    highlight_kind: nextKind,
  };
}

function hasRestaurantChange(
  existing: storage.Restaurant,
  next: NewRestaurant,
): boolean {
  return (
    existing.name !== next.name ||
    existing.neighborhood !== next.neighborhood ||
    existing.cuisine !== next.cuisine ||
    existing.address !== (next.address ?? null) ||
    existing.opened_date !== next.opened_date ||
    existing.source_url !== (next.source_url ?? null) ||
    existing.highlight_kind !== (next.highlight_kind ?? "opening")
  );
}

export async function applyDiscoveredItems(
  { restaurants = [], events = [] }: ApplyDiscoveredItemsInput,
  pool?: Pool,
): Promise<ApplyDiscoveredItemsResult> {
  const newRestaurants: string[] = [];
  const newEvents: string[] = [];
  const updatedRestaurants: string[] = [];

  for (const restaurant of restaurants) {
    const identityKey = buildRestaurantIdentityKey(restaurant);
    const existing =
      (await storage.getRestaurantByIdentityKey(identityKey, pool)) ??
      (restaurant.highlight_kind === "michelin"
        ? await storage.getRestaurantByName(restaurant.name, pool)
        : undefined);
    const mergedRestaurant = mergeRestaurantForUpsert(restaurant, existing);
    const persisted = await storage.addRestaurant(mergedRestaurant, pool);

    if (!existing) {
      await storage.recordUpdate("restaurant", persisted.name, "added", pool);
      newRestaurants.push(persisted.name);
      continue;
    }

    if (!hasRestaurantChange(existing, mergedRestaurant)) {
      continue;
    }

    await storage.recordUpdate("restaurant", persisted.name, "updated", pool);
    updatedRestaurants.push(persisted.name);
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
