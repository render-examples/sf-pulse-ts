import { applyDiscoveredItems } from "../../server/refresh.js";
import {
  getEvents,
  getRestaurants,
  getRestaurantsNeedingMenuCheck,
  updateRestaurantMenu,
} from "../../server/storage.js";
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
  fetchSFist,
} from "./restaurants.js";
import type { NewEvent, NewRestaurant } from "./types.js";

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
  eventTitles: string[];
}> {
  const [restaurants, events] = await Promise.all([
    getRestaurants(),
    getEvents(),
  ]);

  return {
    restaurantNames: restaurants.map((restaurant) => restaurant.name.toLowerCase()),
    eventTitles: events.map((event) => event.title.toLowerCase()),
  };
}

export async function main(): Promise<void> {
  console.log(`[cron] SF Pulse refresh — ${new Date().toISOString()}`);

  const lists = await currentLists();
  const monthYear = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  console.log("[cron] fetching restaurant sources...");
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

  console.log("[cron] fetching event sources...");
  const [funcheapResult, famsfResult, calAcademyResult, ddgEventsResult] =
    await Promise.allSettled([
      fetchFuncheap(lists.eventTitles),
      fetchFAMSF(lists.eventTitles),
      fetchCalAcademy(lists.eventTitles),
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
    lists.eventTitles,
  );

  const seenTitles = new Set<string>(lists.eventTitles);
  const newEvents: NewEvent[] = [];
  for (const event of [
    ...funcheapItems,
    ...famsfItems,
    ...calAcademyItems,
    ...ddgEvents,
  ]) {
    const key = event.title.toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    newEvents.push(event);
  }

  console.log(
    `[cron] candidates: ${newRestaurants.length} restaurants, ${newEvents.length} events`,
  );

  if (newRestaurants.length > 0 || newEvents.length > 0) {
    const result = await applyDiscoveredItems({
      restaurants: newRestaurants,
      events: newEvents,
    });
    console.log("[cron] refresh result:", result);
  } else {
    console.log("[cron] nothing new");
  }

  console.log("[cron] starting menu discovery...");
  try {
    const restaurants = await getRestaurantsNeedingMenuCheck();
    console.log(`[cron] ${restaurants.length} restaurants need menu check`);

    for (const restaurant of restaurants) {
      try {
        console.log(`[cron] checking menu for: ${restaurant.name}`);
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
