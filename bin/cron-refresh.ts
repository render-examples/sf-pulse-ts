/**
 * Render Cron Job — runs daily at 7am PDT.
 *
 * Searches multiple sources for new SF restaurant openings and events,
 * then writes newly-found items directly to the database-backed app code.
 * Existing restaurants and events are read directly from storage so each run
 * only reports items not already stored.
 */
import { getPool } from "../server/db.js";
import { main } from "./cron-refresh/run.js";

export { main } from "./cron-refresh/run.js";
export { searchWeb } from "./cron-refresh/http.js";
export {
  stripHtml,
  escapeHtml,
  normalizeWhitespace,
  stripParsingNoiseHtml,
} from "./cron-refresh/html.js";
export { parseRss, fetchRss } from "./cron-refresh/rss.js";
export {
  extractRestaurants,
  extractMichelinPublicationUrls,
  parseEaterArticle,
  parseMichelinGuideRestaurantPage,
  parseMichelinSelectionPage,
  fetchEaterSF,
  fetchMichelinCaliforniaSelection,
  fetchSFist,
} from "./cron-refresh/restaurants.js";
export {
  extractEvents,
  fetchFuncheap,
  fetchFAMSF,
  parseFuncheapEventPage,
  parseFAMSFPage,
  fetchCalAcademy,
  parseCalAcademyPage,
} from "./cron-refresh/events.js";
export {
  extractUrls,
  findMenuUrls,
  parseDietaryFlags,
  discoverMenu,
} from "./cron-refresh/menu.js";
export type {
  RssItem,
  NewRestaurant,
  NewEvent,
} from "./cron-refresh/types.js";

const isMain =
  process.argv[1]?.endsWith("cron-refresh.ts") ||
  process.argv[1]?.endsWith("cron.cjs");

if (isMain) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await getPool().end();
      } catch {
        // Ignore pool shutdown failures so process exit code reflects the main task.
      }
    });
}
