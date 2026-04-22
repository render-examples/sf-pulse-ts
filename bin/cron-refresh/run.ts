import { applyDiscoveredItems } from "../../server/refresh.js";
import {
  getCronRun,
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

export function settled<T>(
  result: PromiseSettledResult<T>,
  label: string,
  fallback: T,
): T {
  if (result.status === "fulfilled") return result.value;
  console.warn(`[cron] source failed (${label}):`, result.reason);
  return fallback;
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

export function dedupRestaurants(items: NewRestaurant[]): NewRestaurant[] {
  const seen = new Set<string>()
  const result: NewRestaurant[] = []
  for (const restaurant of items) {
    const key = restaurant.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(restaurant)
  }
  return result
}

export function dedupEvents(items: NewEvent[]): NewEvent[] {
  const seen = new Set<string>()
  const result: NewEvent[] = []
  for (const event of items) {
    const normalizedDate = normalizeDateText(event.date)
    const key = buildEventIdentityKey({
      title: event.title,
      location: event.location,
      dateText: normalizedDate,
    })
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      ...event,
      date: normalizedDate,
    })
  }
  return result
}

export async function main(): Promise<void> {
  console.info(`[cron] SF Pulse refresh — ${new Date().toISOString()}`);
  const monthYear = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  console.info("[cron] fetching restaurant sources...");
  const [eaterResult, sfistResult, ddgRestaurantsResult] =
    await Promise.allSettled([
      fetchEaterSF([]),
      fetchSFist([]),
      searchWeb(`new restaurant openings San Francisco ${monthYear}`),
    ]);

  const eaterItems = settled(eaterResult, "Eater SF", [] as NewRestaurant[]);
  const sfistItems = settled(sfistResult, "SFist", [] as NewRestaurant[]);
  const ddgRestaurants = extractRestaurants(
    stripHtml(settled(ddgRestaurantsResult, "DuckDuckGo (restaurants)", "")),
    [],
  );

  const newRestaurants = dedupRestaurants([
    ...eaterItems,
    ...sfistItems,
    ...ddgRestaurants,
  ])

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
      fetchFuncheap([]),
      fetchFAMSF([]),
      fetchCalAcademy([]),
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
    [],
  );

  const newEvents = dedupEvents([
    ...funcheapItems,
    ...famsfItems,
    ...calAcademyItems,
    ...ddgEvents,
  ])

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
