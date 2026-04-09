import type { Pool } from "pg";
import webpush from "web-push";
import type { NewEvent, NewRestaurant } from "./storage.js";
import * as storage from "./storage.js";
import { getVapidConfig, isTrustedPushEndpoint } from "./security.js";
import { broadcast } from "./sse.js";
import { buildEventIdentityKey } from "../shared/event-identity.ts";
import { buildRestaurantIdentityKey } from "../shared/restaurant-identity.ts";
import { normalizeDateText } from "../shared/dates.ts";
import {
  deriveEventCategory,
  eventMatchesPushPreferences,
  formatEventCategory,
  restaurantMatchesPushPreferences,
} from "../shared/catalog.ts";
import { eventDetailHref, restaurantDetailHref } from "../shared/render.ts";

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

function describeRestaurant(restaurant: storage.Restaurant): string {
  return `${restaurant.name} (${restaurant.neighborhood} · ${restaurant.cuisine})`;
}

function describeEvent(event: storage.Event): string {
  return `${event.title} (${formatEventCategory(deriveEventCategory(event))} · ${event.date})`;
}

function buildPushPayload(
  restaurants: storage.Restaurant[],
  events: storage.Event[],
): { title: string; body: string; url: string } {
  if (restaurants.length === 1 && events.length === 0) {
    const restaurant = restaurants[0];
    return {
      title: restaurant.name,
      body: `${restaurant.neighborhood} · ${restaurant.cuisine} · ${restaurant.opened_date}`,
      url: restaurantDetailHref(restaurant.id),
    };
  }

  if (restaurants.length === 0 && events.length === 1) {
    const event = events[0];
    return {
      title: event.title,
      body: `${formatEventCategory(deriveEventCategory(event))} · ${event.date} · ${event.location}`,
      url: eventDetailHref(event.id),
    };
  }

  const lines = [
    ...restaurants.map(describeRestaurant),
    ...events.map(describeEvent),
  ];

  return {
    title: "SF Pulse update",
    body: lines.join(" · "),
    url: "/",
  };
}

function summarizeRestaurants(
  added: storage.Restaurant[],
  updated: storage.Restaurant[],
): string | undefined {
  const lines: string[] = [];
  if (added.length) {
    lines.push(
      `${added.length} new restaurant${added.length > 1 ? "s" : ""}: ${added.map((restaurant) => restaurant.name).join(", ")}`,
    );
  }
  if (updated.length) {
    lines.push(
      `${updated.length} updated restaurant${updated.length > 1 ? "s" : ""}: ${updated.map((restaurant) => restaurant.name).join(", ")}`,
    );
  }
  return lines.length ? lines.join(" · ") : undefined;
}

function summarizeEvents(events: storage.Event[]): string | undefined {
  if (events.length === 0) {
    return undefined;
  }

  return `${events.length} new event${events.length > 1 ? "s" : ""}: ${events.map((event) => event.title).join(", ")}`;
}

async function pushToInterestedSubscribers(
  restaurants: storage.Restaurant[],
  events: storage.Event[],
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

    const matchingRestaurants = restaurants.filter((restaurant) =>
      restaurantMatchesPushPreferences(restaurant, sub.preferences),
    );
    const matchingEvents = events.filter((event) =>
      eventMatchesPushPreferences(event, sub.preferences),
    );

    if (matchingRestaurants.length === 0 && matchingEvents.length === 0) {
      return;
    }

    const payload = buildPushPayload(matchingRestaurants, matchingEvents);
    return webpush
      .sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload),
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
  const addedRestaurantRows: storage.Restaurant[] = [];
  const updatedRestaurantRows: storage.Restaurant[] = [];
  const addedEventRows: storage.Event[] = [];
  const versions: string[] = [];

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
      const update = await storage.recordUpdate("restaurant", persisted.name, "added", pool);
      versions.push(String(update.occurred_at));
      newRestaurants.push(persisted.name);
      addedRestaurantRows.push(persisted);
      continue;
    }

    if (!hasRestaurantChange(existing, mergedRestaurant)) {
      continue;
    }

    const update = await storage.recordUpdate("restaurant", persisted.name, "updated", pool);
    versions.push(String(update.occurred_at));
    updatedRestaurants.push(persisted.name);
    updatedRestaurantRows.push(persisted);
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
    const update = await storage.recordUpdate("event", added.title, "added", pool);
    versions.push(String(update.occurred_at));
    newEvents.push(added.title);
    addedEventRows.push(added);
  }

  if (newRestaurants.length > 0 || updatedRestaurants.length > 0 || newEvents.length > 0) {
    const version =
      versions.sort((left, right) => left.localeCompare(right)).at(-1) ??
      (await storage.getLatestUpdateTimestamp(pool));

    if (addedRestaurantRows.length > 0 || updatedRestaurantRows.length > 0) {
      await broadcast("restaurants", {
        version,
        upserted: [...addedRestaurantRows, ...updatedRestaurantRows],
        deleted: [],
        summary: summarizeRestaurants(addedRestaurantRows, updatedRestaurantRows),
      });
    }

    if (addedEventRows.length > 0) {
      await broadcast("events", {
        version,
        upserted: addedEventRows,
        deleted: [],
        summary: summarizeEvents(addedEventRows),
      });
    }

    await pushToInterestedSubscribers(
      [...addedRestaurantRows, ...updatedRestaurantRows],
      addedEventRows,
      pool,
    );
  }

  return {
    added: { restaurants: newRestaurants, events: newEvents },
    updated: { restaurants: updatedRestaurants },
  };
}
