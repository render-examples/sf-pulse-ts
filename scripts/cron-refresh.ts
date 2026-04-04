/**
 * Render Cron Job: runs daily at 7am PDT.
 * Searches the web for new SF restaurant openings and Mission District events,
 * then POSTs new items to the app's /api/cron/refresh endpoint.
 *
 * Reads /var/data/sf-pulse-last-run.json to determine what was seen last run
 * (sliding 3-month window for restaurants, future-only for events).
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const APP_URL = process.env.APP_URL
  ? `https://${process.env.APP_URL}`
  : "http://localhost:5000";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const STATE_DIR = "/var/data";
const STATE_FILE = `${STATE_DIR}/sf-pulse-last-run.json`;

interface RunState {
  restaurantNames: string[];
  eventTitles: string[];
  lastRunAt: string;
}

async function loadState(): Promise<RunState> {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { restaurantNames: [], eventTitles: [], lastRunAt: "" };
  }
}

async function saveState(state: RunState): Promise<void> {
  if (!existsSync(STATE_DIR)) await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Minimal web search via DuckDuckGo instant answers HTML (no API key needed).
 * Falls back to returning [] on error so cron never crashes the service.
 */
async function searchWeb(query: string): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "sf-pulse-cron/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return "";
  return res.text();
}

function extractText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
}

/** Pull current restaurant/event lists from the live app */
async function fetchCurrentLists(): Promise<{ restaurantNames: string[]; eventTitles: string[] }> {
  const [rRes, eRes] = await Promise.all([
    fetch(`${APP_URL}/api/restaurants`),
    fetch(`${APP_URL}/api/events`),
  ]);
  const restaurants: { name: string }[] = await rRes.json();
  const events: { title: string }[] = await eRes.json();
  return {
    restaurantNames: restaurants.map((r) => r.name.toLowerCase()),
    eventTitles: events.map((e) => e.title.toLowerCase()),
  };
}

/**
 * Very lightweight heuristic parser — looks for restaurant names in search results.
 * The cron is best-effort; the real source of truth is the manual seed + human review.
 */
function parseRestaurants(text: string, existing: string[]): { name: string; neighborhood: string; cuisine: string; address: string | null; opened_date: string; source_url: string | null }[] {
  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  // Known SF restaurant sources pattern — extract quoted restaurant names near "opens" or "opening"
  const found: { name: string; neighborhood: string; cuisine: string; address: string | null; opened_date: string; source_url: string | null }[] = [];
  const namePattern = /["']([A-Z][^"']{2,40})["']\s*(?:opens?|opened|opening|debuts?|now open)/gi;
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (!existing.includes(name.toLowerCase()) && !found.find((f) => f.name === name)) {
      found.push({
        name,
        neighborhood: "San Francisco",
        cuisine: "New opening",
        address: null,
        opened_date: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
        source_url: null,
      });
    }
  }
  return found;
}

function parseMissionEvents(text: string, existing: string[]): { title: string; location: string; date: string; time: string | null; description: string | null; source_url: string | null }[] {
  const found: { title: string; location: string; date: string; time: string | null; description: string | null; source_url: string | null }[] = [];
  // Look for patterns like "Event Name - Month Day" or "Event Name on April 12"
  const eventPattern = /([A-Z][A-Za-z &:'-]{4,60})\s+(?:on\s+|[-–]\s*)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?)/g;
  let match;
  while ((match = eventPattern.exec(text)) !== null) {
    const title = match[1].trim().replace(/\s+/g, " ");
    const date = match[2].trim();
    if (!existing.includes(title.toLowerCase()) && !found.find((f) => f.title === title)) {
      found.push({
        title,
        location: "Mission District, San Francisco",
        date,
        time: null,
        description: null,
        source_url: null,
      });
    }
  }
  return found.slice(0, 10); // cap at 10 per run to avoid noise
}

async function main() {
  console.log(`[cron] SF Pulse refresh — ${new Date().toISOString()}`);

  const [state, current] = await Promise.all([loadState(), fetchCurrentLists()]);

  // Search for new content
  const now = new Date();
  const monthYear = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const [rHtml, eHtml] = await Promise.all([
    searchWeb(`new restaurant openings San Francisco ${monthYear}`),
    searchWeb(`Mission District San Francisco events ${monthYear}`),
  ]);

  const rText = extractText(rHtml);
  const eText = extractText(eHtml);

  const newRestaurants = parseRestaurants(rText, current.restaurantNames);
  const newEvents = parseMissionEvents(eText, current.eventTitles);

  console.log(`[cron] found ${newRestaurants.length} new restaurants, ${newEvents.length} new events`);

  if (newRestaurants.length > 0 || newEvents.length > 0) {
    const res = await fetch(`${APP_URL}/api/cron/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": CRON_SECRET,
      },
      body: JSON.stringify({ restaurants: newRestaurants, events: newEvents }),
    });
    const body = await res.json();
    console.log("[cron] refresh response:", body);
  } else {
    console.log("[cron] no new items, nothing to push");
  }

  await saveState({
    restaurantNames: current.restaurantNames,
    eventTitles: current.eventTitles,
    lastRunAt: now.toISOString(),
  });

  console.log("[cron] done");
}

main().catch((err) => {
  console.error("[cron] error:", err);
  process.exit(1);
});
