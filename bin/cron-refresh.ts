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
import type { DietaryFlags, DietaryFlag } from "../server/storage.js";

const APP_URL = process.env.APP_URL
  ? `https://${process.env.APP_URL}`
  : "http://localhost:5000";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const STATE_DIR = "/var/data";
const STATE_FILE = `${STATE_DIR}/sf-pulse-state.json`;

export interface State {
  restaurantNames: string[];
  eventTitles: string[];
  lastRunAt: string;
}

export async function loadState(): Promise<State> {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf-8"));
  } catch {
    return { restaurantNames: [], eventTitles: [], lastRunAt: "" };
  }
}

export async function saveState(s: State): Promise<void> {
  if (!existsSync(STATE_DIR)) await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(s, null, 2));
}

export async function searchWeb(q: string): Promise<string> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    {
      headers: { "User-Agent": "sf-pulse-cron/1.0" },
      signal: AbortSignal.timeout(10_000),
    }
  );
  return res.ok ? res.text() : "";
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
}

export type NewRestaurant = {
  name: string;
  neighborhood: string;
  cuisine: string;
  address: string | null;
  opened_date: string;
  source_url: string | null;
};

export type NewEvent = {
  title: string;
  location: string;
  date: string;
  time: string | null;
  description: string | null;
  source_url: string | null;
};

export function extractRestaurants(text: string, existing: string[]): NewRestaurant[] {
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

export function extractEvents(text: string, existing: string[]): NewEvent[] {
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

// ── Menu discovery & dietary parsing ─────────────────────────────────────────

/**
 * Extract href URLs from an HTML page (DuckDuckGo results or similar).
 */
export function extractUrls(html: string): string[] {
  const pattern = /href="(https?:\/\/[^"]+)"/gi;
  const urls: string[] = [];
  let m;
  while ((m = pattern.exec(html)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

/**
 * Search DuckDuckGo for the restaurant's menu and return candidate URLs,
 * prioritizing: restaurant's own site > Yelp > Google Maps > other.
 */
export async function findMenuUrls(restaurantName: string): Promise<string[]> {
  const queries = [
    `"${restaurantName}" menu San Francisco`,
    `"${restaurantName}" San Francisco site:yelp.com`,
  ];

  const allUrls: string[] = [];
  for (const q of queries) {
    try {
      const html = await searchWeb(q);
      allUrls.push(...extractUrls(html));
    } catch {
      // Search failed — skip silently
    }
  }

  // Deduplicate and filter out search engine / tracking URLs
  const seen = new Set<string>();
  const filtered = allUrls.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    // Skip DuckDuckGo tracking redirects and common non-menu URLs
    if (u.includes("duckduckgo.com")) return false;
    if (u.includes("google.com/search")) return false;
    return true;
  });

  // Sort: prefer Yelp menu pages, then any /menu path, then others
  return filtered.sort((a, b) => {
    const aScore = menuUrlScore(a);
    const bScore = menuUrlScore(b);
    return bScore - aScore;
  });
}

function menuUrlScore(url: string): number {
  const u = url.toLowerCase();
  if (u.includes("/menu")) return 10;
  if (u.includes("yelp.com")) return 5;
  if (u.includes("google.com/maps")) return 3;
  return 1;
}

/**
 * Fetch a URL's text content with a timeout. Returns empty string on failure.
 */
export async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "sf-pulse-cron/1.0" },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await res.text();
    return stripHtml(html);
  } catch {
    return "";
  }
}

// ── Dietary keyword patterns ────────────────────────────────────────────────

// Confirmed patterns: explicit labels, section headers, or item markers
const GF_CONFIRMED = /\b(?:gluten[\s-]?free|gf|celiac[\s-]?friendly)\b/i;
const VEGAN_CONFIRMED = /\b(?:vegan)\b/i;
const VEG_CONFIRMED = /\b(?:vegetarian|veggie|plant[\s-]?based)\b/i;

// Inferred patterns: ingredient-level hints
const GF_INFERRED = /\b(?:cauliflower crust|rice flour|gluten[\s-]?free option|can be made gf)\b/i;
const VEGAN_INFERRED = /\b(?:dairy[\s-]?free|no animal|vegan option|can be made vegan)\b/i;
const VEG_INFERRED = /\b(?:meatless|meat[\s-]?free|vegetable[\s-]?forward|vegetarian option)\b/i;

function checkDietary(
  confirmedRe: RegExp,
  inferredRe: RegExp,
  text: string
): DietaryFlag {
  if (confirmedRe.test(text)) return { available: true, confidence: "confirmed" };
  if (inferredRe.test(text)) return { available: true, confidence: "inferred" };
  return { available: false, confidence: "inferred" };
}

/**
 * Given menu page text, classify dietary options.
 */
export function parseDietaryFlags(text: string): DietaryFlags {
  return {
    gluten_free: checkDietary(GF_CONFIRMED, GF_INFERRED, text),
    vegan: checkDietary(VEGAN_CONFIRMED, VEGAN_INFERRED, text),
    vegetarian: checkDietary(VEG_CONFIRMED, VEG_INFERRED, text),
  };
}

/**
 * Full pipeline for one restaurant: search for menu, fetch it, parse dietary flags.
 * Returns { menuUrl, dietaryFlags }.
 */
export async function discoverMenu(restaurantName: string): Promise<{
  menuUrl: string | null;
  dietaryFlags: DietaryFlags;
}> {
  const defaultFlags: DietaryFlags = {
    gluten_free: { available: false, confidence: "inferred" },
    vegan: { available: false, confidence: "inferred" },
    vegetarian: { available: false, confidence: "inferred" },
  };

  const urls = await findMenuUrls(restaurantName);
  if (urls.length === 0) return { menuUrl: null, dietaryFlags: defaultFlags };

  // Try the top candidate URLs (up to 3) to find actual menu content
  for (const url of urls.slice(0, 3)) {
    const text = await fetchPageText(url);
    if (text.length < 50) continue; // too short to be a real menu

    // Check if it's actually a menu page (has food-related content)
    const menuSignals = /\b(?:menu|appetizer|entr[eé]e|dessert|salad|soup|pizza|pasta|burger|sandwich|bowl|plate|\$\d)\b/i;
    if (!menuSignals.test(text)) continue;

    const flags = parseDietaryFlags(text);
    return { menuUrl: url, dietaryFlags: flags };
  }

  // Couldn't find a parseable menu — mark as checked with no results
  return { menuUrl: urls[0] ?? null, dietaryFlags: defaultFlags };
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

  // Phase 2: Menu discovery for opened restaurants
  console.log("[cron] starting menu discovery...");
  try {
    const menuRes = await fetch(`${APP_URL}/api/restaurants/needing-menu-check`, {
      headers: { "x-cron-secret": CRON_SECRET },
    });
    if (menuRes.ok) {
      const toCheck: { id: number; name: string }[] = await menuRes.json();
      console.log(`[cron] ${toCheck.length} restaurants need menu check`);

      // Process sequentially to avoid hammering search engines
      for (const r of toCheck.slice(0, 10)) {
        try {
          console.log(`[cron] checking menu for: ${r.name}`);
          const { menuUrl, dietaryFlags } = await discoverMenu(r.name);
          await fetch(`${APP_URL}/api/restaurants/${r.id}/menu`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-cron-secret": CRON_SECRET,
            },
            body: JSON.stringify({ menuUrl, dietaryFlags }),
          });
        } catch (err) {
          console.error(`[cron] menu check failed for ${r.name}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[cron] menu discovery phase failed:", err);
  }
}

// Only run when executed directly, not when imported by tests.
const isMain = process.argv[1]?.endsWith("cron-refresh.ts") ||
               process.argv[1]?.endsWith("cron.cjs");
if (isMain) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
