import type { Pool } from "pg";
import webpush from "web-push";
import type { NewEvent, NewRestaurant } from "./storage.js";
import * as storage from "./storage.js";
import { getVapidConfig, isTrustedPushEndpoint } from "./security.js";
import { broadcast } from "./sse.js";
import { buildEventIdentityKey } from "../shared/event-identity.ts";
import { buildRestaurantIdentityKey } from "../shared/restaurant-identity.ts";
import { getDatePrecision, normalizeDateText, type DatePrecision } from "../shared/dates.ts";
import {
  deriveEventCategory,
  eventMatchesPushPreferences,
  formatEventCategory,
  restaurantMatchesPushPreferences,
} from "../shared/catalog.ts";
import {
  decodeHtmlEntitiesRecursive,
  normalizeEscapedHtmlText,
  normalizeWhitespace,
} from "../shared/html.ts";
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

function summarizeEvents(
  added: storage.Event[],
  updated: storage.Event[],
): string | undefined {
  const lines: string[] = [];
  if (added.length) {
    lines.push(
      `${added.length} new event${added.length > 1 ? "s" : ""}: ${added.map((event) => event.title).join(", ")}`,
    );
  }
  if (updated.length) {
    lines.push(
      `${updated.length} updated event${updated.length > 1 ? "s" : ""}: ${updated.map((event) => event.title).join(", ")}`,
    );
  }
  return lines.length ? lines.join(" · ") : undefined;
}

const DATE_PRECISION_SCORE: Record<DatePrecision, number> = {
  unknown: 0,
  year: 1,
  season: 2,
  month: 3,
  day_range: 4,
  day: 5,
};

function stripRestaurantDateQualifier(value: string): string {
  const qualifierIndex = value.indexOf("·");
  return qualifierIndex === -1 ? value : value.slice(qualifierIndex + 1).trim();
}

function normalizeRestaurantOpenedDateText(value: string): string {
  const cleaned = value.replace(/\s*\(upcoming\)\s*$/i, "").trim();
  const qualifierIndex = cleaned.indexOf("·");
  if (qualifierIndex === -1) {
    return normalizeDateText(cleaned);
  }

  const qualifier = cleaned.slice(0, qualifierIndex).trim();
  const datePart = cleaned.slice(qualifierIndex + 1).trim();
  return `${qualifier} · ${normalizeDateText(datePart)}`;
}

function normalizeRestaurantNameForMatch(value: string): string {
  return normalizeWhitespace(decodeHtmlEntitiesRecursive(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeAddressForMatch(value: string | null | undefined): string {
  return normalizeWhitespace(value ?? "")
    .toLowerCase()
    .replace(/\b(?:san francisco|ca)\b/g, " ")
    .replace(/\b\d{5}(?:-\d{4})?\b/g, " ")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\bplace\b/g, "pl")
    .replace(/\bterrace\b/g, "ter")
    .replace(/\bsuite\b/g, "ste")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeEventTitleForMatch(value: string): string {
  return normalizeWhitespace(decodeHtmlEntitiesRecursive(value))
    .toLowerCase();
}

function normalizeEventLocationForMatch(value: string): string {
  return normalizeWhitespace(decodeHtmlEntitiesRecursive(value))
    .toLowerCase();
}

function normalizedPrecisionScore(value: string): number {
  return DATE_PRECISION_SCORE[getDatePrecision(stripRestaurantDateQualifier(value))];
}

function prefersIncomingDate(
  existingDate: string | undefined,
  incomingDate: string,
): boolean {
  if (!existingDate) {
    return true;
  }

  const incomingScore = normalizedPrecisionScore(incomingDate);
  const existingScore = normalizedPrecisionScore(existingDate);
  if (incomingScore !== existingScore) {
    return incomingScore > existingScore;
  }

  return incomingDate.length > existingDate.length;
}

function isGenericRestaurantNeighborhood(value: string | null | undefined): boolean {
  return normalizeWhitespace(value ?? "").toLowerCase() === "san francisco";
}

function isGenericRestaurantCuisine(value: string | null | undefined): boolean {
  return normalizeWhitespace(value ?? "").toLowerCase() === "new opening";
}

function isGenericEventLocation(value: string | null | undefined): boolean {
  return normalizeWhitespace(value ?? "").toLowerCase() === "san francisco";
}

function eventDescriptionScore(value: string | null): number {
  if (!value) {
    return 0;
  }

  const normalized = decodeHtmlEntitiesRecursive(value).toLowerCase();
  if (/appeared first on funcheap/.test(normalized)) {
    return 1;
  }

  return normalized.length + 10;
}

function mergeRestaurantForUpsert(
  incoming: NewRestaurant,
  existing?: storage.Restaurant,
): NewRestaurant {
  const nextKind = incoming.highlight_kind ?? existing?.highlight_kind ?? "opening";
  const normalizedIncomingDate = normalizeRestaurantOpenedDateText(incoming.opened_date);
  const normalizedExistingDate = existing
    ? normalizeRestaurantOpenedDateText(existing.opened_date)
    : undefined;
  const normalizedIncomingNeighborhood = normalizeWhitespace(incoming.neighborhood);
  const normalizedExistingNeighborhood = normalizeWhitespace(existing?.neighborhood ?? "");
  const normalizedIncomingCuisine = normalizeWhitespace(incoming.cuisine);
  const normalizedExistingCuisine = normalizeWhitespace(existing?.cuisine ?? "");

  return {
    ...incoming,
    name: normalizeWhitespace(decodeHtmlEntitiesRecursive(incoming.name)),
    neighborhood:
      normalizedIncomingNeighborhood &&
      (!isGenericRestaurantNeighborhood(normalizedIncomingNeighborhood) ||
        !normalizedExistingNeighborhood)
        ? normalizedIncomingNeighborhood
        : (normalizedExistingNeighborhood || normalizedIncomingNeighborhood),
    cuisine:
      normalizedIncomingCuisine &&
      (!isGenericRestaurantCuisine(normalizedIncomingCuisine) ||
        !normalizedExistingCuisine)
        ? normalizedIncomingCuisine
        : (normalizedExistingCuisine || normalizedIncomingCuisine),
    address:
      normalizeWhitespace(incoming.address ?? "") ||
      normalizeWhitespace(existing?.address ?? "") ||
      null,
    opened_date: prefersIncomingDate(normalizedExistingDate, normalizedIncomingDate)
      ? normalizedIncomingDate
      : (normalizedExistingDate ?? normalizedIncomingDate),
    source_url: incoming.source_url ?? existing?.source_url ?? null,
    highlight_kind: nextKind,
  };
}

function mergeEventForUpsert(
  incoming: NewEvent,
  existing?: storage.Event,
): NewEvent {
  const normalizedIncomingDate = normalizeDateText(incoming.date);
  const normalizedExistingDate = existing ? normalizeDateText(existing.date) : undefined;
  const normalizedIncomingTitle = normalizeEscapedHtmlText(incoming.title);
  const normalizedExistingTitle = existing
    ? normalizeEscapedHtmlText(existing.title)
    : undefined;
  const normalizedIncomingLocation = normalizeWhitespace(
    decodeHtmlEntitiesRecursive(incoming.location),
  );
  const normalizedExistingLocation = normalizeWhitespace(
    decodeHtmlEntitiesRecursive(existing?.location ?? ""),
  );
  const normalizedIncomingDescription = incoming.description
    ? normalizeEscapedHtmlText(incoming.description)
    : null;
  const normalizedExistingDescription = existing?.description
    ? normalizeEscapedHtmlText(existing.description)
    : null;

  return {
    title:
      normalizedIncomingTitle.length >= (normalizedExistingTitle?.length ?? 0)
        ? normalizedIncomingTitle
        : (normalizedExistingTitle ?? normalizedIncomingTitle),
    location:
      normalizedIncomingLocation &&
      (!isGenericEventLocation(normalizedIncomingLocation) || !normalizedExistingLocation)
        ? normalizedIncomingLocation
        : (normalizedExistingLocation || normalizedIncomingLocation),
    date:
      prefersIncomingDate(normalizedExistingDate, normalizedIncomingDate)
        ? normalizedIncomingDate
        : (normalizedExistingDate ?? normalizedIncomingDate),
    time: incoming.time ?? existing?.time ?? null,
    description:
      eventDescriptionScore(normalizedIncomingDescription) >=
      eventDescriptionScore(normalizedExistingDescription)
        ? normalizedIncomingDescription
        : normalizedExistingDescription,
    source_url: incoming.source_url ?? existing?.source_url ?? null,
  };
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

function hasEventChange(existing: storage.Event, next: NewEvent): boolean {
  return (
    existing.title !== next.title ||
    existing.location !== next.location ||
    existing.date !== next.date ||
    existing.time !== (next.time ?? null) ||
    existing.description !== (next.description ?? null) ||
    existing.source_url !== (next.source_url ?? null)
  );
}

function buildEventSourceMatchKey(
  event: Pick<storage.Event | NewEvent, "title" | "date" | "source_url">,
): string | null {
  if (!event.source_url) {
    return null;
  }

  return [
    event.source_url,
    normalizeEventTitleForMatch(event.title),
    normalizeDateText(event.date).toLowerCase(),
  ].join("|");
}

function findMatchingRestaurant(
  restaurant: NewRestaurant,
  existingRestaurants: storage.Restaurant[],
): storage.Restaurant | undefined {
  const identityKey = buildRestaurantIdentityKey(restaurant);
  const exact =
    existingRestaurants.find(
      (candidate) => buildRestaurantIdentityKey(candidate) === identityKey,
    ) ??
    (restaurant.highlight_kind === "michelin"
      ? existingRestaurants.find(
          (candidate) => candidate.name.toLowerCase() === restaurant.name.toLowerCase(),
        )
      : undefined);

  if (exact) {
    return exact;
  }

  const normalizedIncomingAddress = normalizeAddressForMatch(restaurant.address);
  if (!normalizedIncomingAddress) {
    return undefined;
  }

  const normalizedIncomingName = normalizeRestaurantNameForMatch(restaurant.name);
  return existingRestaurants.find((candidate) => {
    const normalizedCandidateAddress = normalizeAddressForMatch(candidate.address);
    if (!normalizedCandidateAddress || normalizedCandidateAddress !== normalizedIncomingAddress) {
      return false;
    }

    const normalizedCandidateName = normalizeRestaurantNameForMatch(candidate.name);
    return (
      normalizedCandidateName.includes(normalizedIncomingName) ||
      normalizedIncomingName.includes(normalizedCandidateName)
    );
  });
}

function findMatchingEvent(
  event: NewEvent,
  existingEvents: storage.Event[],
): storage.Event | undefined {
  const dedupeKey = buildEventIdentityKey({
    title: event.title,
    location: event.location,
    dateText: normalizeDateText(event.date),
  });
  const sourceMatchKey = buildEventSourceMatchKey(event);
  const normalizedTitle = normalizeEventTitleForMatch(event.title);
  const normalizedDate = normalizeDateText(event.date).toLowerCase();
  const normalizedLocation = normalizeEventLocationForMatch(event.location);

  return (
    existingEvents.find((candidate) => candidate.dedupe_key === dedupeKey) ??
    (sourceMatchKey
      ? existingEvents.find(
          (candidate) => buildEventSourceMatchKey(candidate) === sourceMatchKey,
        )
      : undefined) ??
    existingEvents.find((candidate) => {
      const candidateTitle = normalizeEventTitleForMatch(candidate.title);
      const candidateDate = normalizeDateText(candidate.date).toLowerCase();
      const candidateLocation = normalizeEventLocationForMatch(candidate.location);
      if (candidateTitle !== normalizedTitle || candidateDate !== normalizedDate) {
        return false;
      }

      return (
        candidateLocation === normalizedLocation ||
        isGenericEventLocation(candidate.location) ||
        isGenericEventLocation(event.location)
      );
    })
  );
}

export async function applyDiscoveredItems(
  { restaurants = [], events = [] }: ApplyDiscoveredItemsInput,
  pool?: Pool,
): Promise<ApplyDiscoveredItemsResult> {
  const existingRestaurants = await storage.getRestaurants(pool);
  const existingEvents = await storage.getEvents(pool);
  const newRestaurants: string[] = [];
  const newEvents: string[] = [];
  const updatedRestaurants: string[] = [];
  const addedRestaurantRows: storage.Restaurant[] = [];
  const updatedRestaurantRows: storage.Restaurant[] = [];
  const addedEventRows: storage.Event[] = [];
  const updatedEventRows: storage.Event[] = [];
  const versions: string[] = [];

  for (const restaurant of restaurants) {
    const existing = findMatchingRestaurant(restaurant, existingRestaurants);
    const mergedRestaurant = mergeRestaurantForUpsert(restaurant, existing);

    if (!existing) {
      const persisted = await storage.addRestaurant(mergedRestaurant, pool);
      const update = await storage.recordUpdate("restaurant", persisted.name, "added", pool);
      versions.push(String(update.occurred_at));
      newRestaurants.push(persisted.name);
      addedRestaurantRows.push(persisted);
      existingRestaurants.push(persisted);
      continue;
    }

    if (!hasRestaurantChange(existing, mergedRestaurant)) {
      continue;
    }

    const persisted = await storage.updateRestaurant(existing.id, mergedRestaurant, pool);
    const update = await storage.recordUpdate("restaurant", persisted.name, "updated", pool);
    versions.push(String(update.occurred_at));
    updatedRestaurants.push(persisted.name);
    updatedRestaurantRows.push(persisted);
    const existingIndex = existingRestaurants.findIndex((candidate) => candidate.id === existing.id);
    if (existingIndex !== -1) {
      existingRestaurants[existingIndex] = persisted;
    }
  }

  for (const event of events) {
    const existing = findMatchingEvent(event, existingEvents);
    const mergedEvent = mergeEventForUpsert(event, existing);

    if (!existing) {
      const added = await storage.addEvent(mergedEvent, pool);
      const update = await storage.recordUpdate("event", added.title, "added", pool);
      versions.push(String(update.occurred_at));
      newEvents.push(added.title);
      addedEventRows.push(added);
      existingEvents.push(added);
      continue;
    }

    if (!hasEventChange(existing, mergedEvent)) {
      continue;
    }

    const updated = await storage.updateEvent(existing.id, mergedEvent, pool);
    const update = await storage.recordUpdate("event", updated.title, "updated", pool);
    versions.push(String(update.occurred_at));
    updatedEventRows.push(updated);
    const existingIndex = existingEvents.findIndex((candidate) => candidate.id === existing.id);
    if (existingIndex !== -1) {
      existingEvents[existingIndex] = updated;
    }
  }

  if (
    newRestaurants.length > 0 ||
    updatedRestaurants.length > 0 ||
    newEvents.length > 0 ||
    updatedEventRows.length > 0
  ) {
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

    if (addedEventRows.length > 0 || updatedEventRows.length > 0) {
      await broadcast("events", {
        version,
        upserted: [...addedEventRows, ...updatedEventRows],
        deleted: [],
        summary: summarizeEvents(addedEventRows, updatedEventRows),
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
