import { applyDiscoveredItems } from "../../server/refresh.js";
import {
  getEvents,
  getCronRun,
  getRestaurants,
  getRestaurantsNeedingMenuCheck,
  markCronRun,
  updateRestaurantMenu,
} from "../../server/storage.js";
import { normalizeDateText } from "../../shared/dates.ts";
import { buildEventIdentityKey } from "../../shared/event-identity.ts";
import { stripHtml } from "./html.js";
import { searchWeb } from "./http.js";
import { discoverMenu } from "./menu.js";
import {
  extractEvents,
  fetchCalAcademy,
  fetchFAMSF,
  fetchFuncheap,
} from "./events.js";
import {
  extractRestaurants,
  fetchEaterSF,
  fetchMichelinCaliforniaSelection,
  fetchSFist,
} from "./restaurants.js";
import type { NewEvent, NewRestaurant } from "./types.js";

const MICHELIN_CRON_JOB = "michelin_california_selection";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function settled<T>(
  result: PromiseSettledResult<T>,
  label: string,
  fallback: T,
): T {
  if (result.status === "fulfilled") return result.value;
  console.warn(`[cron] source failed (${label}):`, result.reason);
  return fallback;
}

async function currentLists(): Promise<{
  restaurantNames: string[];
  eventKeys: string[];
}> {
  const [restaurants, events] = await Promise.all([
    getRestaurants(),
    getEvents(),
  ]);

  return {
    restaurantNames: restaurants.map((restaurant) => restaurant.name.toLowerCase()),
    eventKeys: events.map((event) => event.dedupe_key),
  };
}

export function isCronJobDue(
  lastRunAt: string | null | undefined,
  intervalMs: number,
  reference = new Date(),
): boolean {
  if (!lastRunAt) return true;
  const lastRun = new Date(lastRunAt);
  if (Number.isNaN(lastRun.getTime())) return true;
  return reference.getTime() - lastRun.getTime() >= intervalMs;
}

export async function main(): Promise<void> {
  console.info(`[cron] SF Pulse refresh — ${new Date().toISOString()}`);

  const lists = await currentLists();
  const monthYear = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  console.info("[cron] fetching restaurant sources...");
  const [eaterResult, sfistResult, ddgRestaurantsResult] =
    await Promise.allSettled([
      fetchEaterSF(lists.restaurantNames),
      fetchSFist(lists.restaurantNames),
      searchWeb(`new restaurant openings San Francisco ${monthYear}`),
    ]);

  const eaterItems = settled(eaterResult, "Eater SF", [] as NewRestaurant[]);
  const sfistItems = settled(sfistResult, "SFist", [] as NewRestaurant[]);
  const ddgRestaurants = extractRestaurants(
    stripHtml(settled(ddgRestaurantsResult, "DuckDuckGo (restaurants)", "")),
    lists.restaurantNames,
  );

  const seenNames = new Set<string>(lists.restaurantNames);
  const newRestaurants: NewRestaurant[] = [];
  for (const restaurant of [...eaterItems, ...sfistItems, ...ddgRestaurants]) {
    const key = restaurant.name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    newRestaurants.push(restaurant);
  }

  const michelinRun = await getCronRun(MICHELIN_CRON_JOB);
  if (isCronJobDue(michelinRun?.last_ran_at, THREE_DAYS_MS)) {
    console.info("[cron] checking Michelin California selection...");
    try {
      const michelinItems = await fetchMichelinCaliforniaSelection();
      for (const restaurant of michelinItems) {
        const key = restaurant.name.toLowerCase();
        if (newRestaurants.some((candidate) => candidate.name.toLowerCase() === key)) {
          continue;
        }
        newRestaurants.push(restaurant);
      }
      await markCronRun(MICHELIN_CRON_JOB);
      console.info(`[cron] Michelin candidates: ${michelinItems.length}`);
    } catch (error) {
      console.error("[cron] Michelin selection check failed:", error);
    }
  }

  console.info("[cron] fetching event sources...");
  const [funcheapResult, famsfResult, calAcademyResult, ddgEventsResult] =
    await Promise.allSettled([
      fetchFuncheap(lists.eventKeys),
      fetchFAMSF(lists.eventKeys),
      fetchCalAcademy(lists.eventKeys),
      searchWeb(`San Francisco events Golden Gate Park concerts ${monthYear}`),
    ]);

  const funcheapItems = settled(funcheapResult, "Funcheap", [] as NewEvent[]);
  const famsfItems = settled(famsfResult, "FAMSF", [] as NewEvent[]);
  const calAcademyItems = settled(
    calAcademyResult,
    "Cal Academy",
    [] as NewEvent[],
  );
  const ddgEvents = extractEvents(
    stripHtml(settled(ddgEventsResult, "DuckDuckGo (events)", "")),
    lists.eventKeys,
  );

  const seenKeys = new Set<string>(lists.eventKeys);
  const newEvents: NewEvent[] = [];
  for (const event of [
    ...funcheapItems,
    ...famsfItems,
    ...calAcademyItems,
    ...ddgEvents,
  ]) {
    const normalizedDate = normalizeDateText(event.date);
    const key = buildEventIdentityKey({
      title: event.title,
      location: event.location,
      dateText: normalizedDate,
    });
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    newEvents.push({
      ...event,
      date: normalizedDate,
    });
  }

  console.info(
    `[cron] candidates: ${newRestaurants.length} restaurants, ${newEvents.length} events`,
  );

  if (newRestaurants.length > 0 || newEvents.length > 0) {
    const result = await applyDiscoveredItems({
      restaurants: newRestaurants,
      events: newEvents,
    });
    console.info("[cron] refresh result:", result);
  } else {
    console.info("[cron] nothing new");
  }

  console.info("[cron] starting menu discovery...");
  try {
    const restaurants = await getRestaurantsNeedingMenuCheck();
    console.info(`[cron] ${restaurants.length} restaurants need menu check`);

    for (const restaurant of restaurants) {
      try {
        console.info(`[cron] checking menu for: ${restaurant.name}`);
        const { menuUrl, dietaryFlags } = await discoverMenu(restaurant.name);
        await updateRestaurantMenu(restaurant.id, menuUrl, dietaryFlags);
        console.info(`[cron] found menu for ${restaurant.name}`);
      } catch (error) {
        console.error(`[cron] menu check failed for ${restaurant.name}:`, error);
      }
    }
  } catch (error) {
    console.error("[cron] menu discovery phase failed:", error);
  }
}
