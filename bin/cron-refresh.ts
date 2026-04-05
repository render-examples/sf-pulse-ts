/**
 * Render Cron Job — runs daily at 7am PDT.
 *
 * Searches the web for new SF restaurant openings and Mission District events,
 * then POSTs newly-found items to the app's /api/cron/refresh endpoint.
 * State is persisted to /var/data/sf-pulse-state.json (Render persistent disk)
 * so each run only reports items not seen in prior runs.
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const APP_URL = process.env.APP_URL
  ? `https://${process.env.APP_URL}`
  : "http://localhost:5000";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const STATE_DIR = "/var/data";
const STATE_FILE = `${STATE_DIR}/sf-pulse-state.json`;

interface State {
  restaurantNames: string[];
  eventTitles: string[];
  lastRunAt: string;
}

async function loadState(): Promise<State> {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf-8"));
  } catch {
    return { restaurantNames: [], eventTitles: [], lastRunAt: "" };
  }
}

async function saveState(s: State): Promise<void> {
  if (!existsSync(STATE_DIR)) await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(s, null, 2));
}

async function searchWeb(q: string): Promise<string> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    {
      headers: { "User-Agent": "sf-pulse-cron/1.0" },
      signal: AbortSignal.timeout(10_000),
    }
  );
  return res.ok ? res.text() : "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
}

async function currentLists(): Promise<{ restaurantNames: string[]; eventTitles: string[] }> {
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

type NewRestaurant = { name: string; neighborhood: string; cuisine: string; address: string | null; opened_date: string; source_url: string | null };
type NewEvent = { title: string; location: string; date: string; time: string | null; description: string | null; source_url: string | null };

function extractRestaurants(text: string, existing: string[]): NewRestaurant[] {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const results: NewRestaurant[] = [];
  const pattern = /["']([A-Z][^"']{2,40})["']\s*(?:opens?|opened|opening|debuts?|now open)/gi;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const name = m[1].trim();
    if (!existing.includes(name.toLowerCase()) && !results.find((r) => r.name === name)) {
      results.push({ name, neighborhood: "San Francisco", cuisine: "New opening", address: null, opened_date: month, source_url: null });
    }
  }
  return results;
}

function extractEvents(text: string, existing: string[]): NewEvent[] {
  const results: NewEvent[] = [];
  const months = "January|February|March|April|May|June|July|August|September|October|November|December";
  const pattern = new RegExp(
    `([A-Z][A-Za-z &:'\\-]{4,60})\\s+(?:on\\s+|[–-]\\s*)?((?:${months})\\s+\\d{1,2}(?:,?\\s+\\d{4})?)`,
    "g"
  );
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const title = m[1].trim().replace(/\s+/g, " ");
    const date = m[2].trim();
    if (!existing.includes(title.toLowerCase()) && !results.find((e) => e.title === title)) {
      results.push({ title, location: "Mission District, San Francisco", date, time: null, description: null, source_url: null });
    }
  }
  return results.slice(0, 10);
}

async function main() {
  console.log(`[cron] SF Pulse refresh — ${new Date().toISOString()}`);

  const [state, lists] = await Promise.all([loadState(), currentLists()]);
  const now = new Date();
  const monthYear = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  const [rHtml, eHtml] = await Promise.all([
    searchWeb(`new restaurant openings San Francisco ${monthYear}`),
    searchWeb(`Mission District San Francisco events ${monthYear}`),
  ]);

  const newRestaurants = extractRestaurants(stripHtml(rHtml), lists.restaurantNames);
  const newEvents = extractEvents(stripHtml(eHtml), lists.eventTitles);

  console.log(`[cron] candidates: ${newRestaurants.length} restaurants, ${newEvents.length} events`);

  if (newRestaurants.length > 0 || newEvents.length > 0) {
    const res = await fetch(`${APP_URL}/api/cron/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
      body: JSON.stringify({ restaurants: newRestaurants, events: newEvents }),
    });
    console.log("[cron] refresh response:", await res.json());
  } else {
    console.log("[cron] nothing new");
  }

  await saveState({
    restaurantNames: lists.restaurantNames,
    eventTitles: lists.eventTitles,
    lastRunAt: now.toISOString(),
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
