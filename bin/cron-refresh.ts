/**
 * Render Cron Job — runs daily at 7am PDT.
 *
 * Searches multiple sources for new SF restaurant openings and events,
 * then POSTs newly-found items to the app's /api/cron/refresh endpoint.
 * Existing restaurants and events are read from the app's database-backed API
 * so each run only reports items not already stored.
 *
 * Sources:
 *   Restaurants: Eater SF (Atom), SFist (RSS 2.0), DuckDuckGo fallback
 *   Events:      Funcheap (RSS 2.0), FAMSF calendar page, Cal Academy events page,
 *                DuckDuckGo fallback
 */
import type { DietaryFlags, DietaryFlag } from "../server/storage.js";

export function resolveAppUrl(
  raw = process.env.APP_URL,
  port = process.env.PORT,
): string {
  if (!raw) return `http://localhost:${port ?? "5000"}`;

  const normalized = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (/^[^/]+:\d+$/.test(normalized)) return `http://${normalized}`;
  return `https://${normalized}`;
}

const APP_URL = resolveAppUrl();
const CRON_SECRET = process.env.CRON_SECRET ?? "";

export async function searchWeb(q: string): Promise<string> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    {
      headers: { "User-Agent": "sf-pulse-cron/1.0" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  return res.ok ? res.text() : "";
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

// ── RSS / Atom parser ─────────────────────────────────────────────────────────

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

/**
 * Parse an RSS 2.0 or Atom feed XML string into a flat array of RssItem.
 * Handles:
 *   - Atom: <entry> / <published> / <summary> / <link rel="alternate" href="…"/>
 *   - RSS 2.0: <item> / <pubDate> / <description> / <link>
 *   - CDATA sections in any field
 */
export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // Normalise CDATA: strip the wrapper so the inner text is just plain text.
  const stripCdata = (s: string) =>
    s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();

  // Generic attribute extractor: returns the value of a named attribute in a tag.
  const attr = (tag: string, name: string): string => {
    const m = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
    return m ? m[1] : "";
  };

  // Extract text between a pair of XML tags (non-greedy, first match).
  const between = (source: string, tag: string): string => {
    const m = source.match(
      new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
    );
    return m ? stripCdata(m[1].trim()) : "";
  };

  // Detect feed type.
  const isAtom = /<feed\b/i.test(xml);
  const itemTag = isAtom ? "entry" : "item";

  // Split on opening tags of the item element.
  const chunks = xml.split(new RegExp(`<${itemTag}[\\s>]`, "i"));
  // chunks[0] is the feed header; subsequent chunks are individual items.
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];

    let title = between(chunk, "title");
    // Strip any residual HTML from titles.
    title = stripHtml(title);

    let link = "";
    if (isAtom) {
      // Atom: <link rel="alternate" href="…"/> — self-closing
      const linkMatch = chunk.match(/<link\s[^>]*href="([^"]+)"[^>]*\/>/i);
      if (linkMatch) link = linkMatch[1];
    } else {
      link = between(chunk, "link");
    }

    const pubDate = isAtom
      ? between(chunk, "published")
      : between(chunk, "pubDate");
    const description = isAtom
      ? between(chunk, "summary")
      : between(chunk, "description");

    if (title) {
      items.push({ title, link, pubDate, description: stripHtml(description) });
    }
  }

  return items;
}

/**
 * Fetch an RSS/Atom feed URL and return parsed items.
 * Returns empty array on any network or parse error.
 */
export async function fetchRss(url: string): Promise<RssItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "sf-pulse-cron/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml);
  } catch {
    return [];
  }
}

async function fetchPageHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "sf-pulse-cron/1.0" },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  }
}

// ── Type definitions ──────────────────────────────────────────────────────────

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

// ── Text extractors (kept for DuckDuckGo fallback) ────────────────────────────

export function extractRestaurants(
  text: string,
  existing: string[],
): NewRestaurant[] {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const results: NewRestaurant[] = [];
  const pattern =
    /["']([A-Z][^"']{2,40})["']\s*(?:opens?|opened|opening|debuts?|now open)/gi;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const name = m[1].trim();
    if (
      !existing.includes(name.toLowerCase()) &&
      !results.find((r) => r.name === name)
    ) {
      results.push({
        name,
        neighborhood: "San Francisco",
        cuisine: "New opening",
        address: null,
        opened_date: month,
        source_url: null,
      });
    }
  }
  return results;
}

function normalizeRestaurantName(name: string): string {
  return name
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function addRestaurantCandidate(
  results: NewRestaurant[],
  existing: string[],
  name: string,
  openedDate: string,
  sourceUrl: string | null,
) {
  const normalized = normalizeRestaurantName(name);
  if (normalized.length < 3) return;
  if (existing.includes(normalized.toLowerCase())) return;
  if (results.find((r) => r.name.toLowerCase() === normalized.toLowerCase())) return;

  results.push({
    name: normalized,
    neighborhood: "San Francisco",
    cuisine: "New opening",
    address: null,
    opened_date: openedDate,
    source_url: sourceUrl,
  });
}

export function extractEvents(text: string, existing: string[]): NewEvent[] {
  const results: NewEvent[] = [];
  const months =
    "January|February|March|April|May|June|July|August|September|October|November|December";
  const pattern = new RegExp(
    `([A-Z][A-Za-z &:'\\-]{4,60})\\s+(?:on\\s+|[–-]\\s*)?((?:${months})\\s+\\d{1,2}(?:,?\\s+\\d{4})?)`,
    "g",
  );
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const title = m[1].trim().replace(/\s+/g, " ");
    const date = m[2].trim();
    if (
      !existing.includes(title.toLowerCase()) &&
      !results.find((e) => e.title === title)
    ) {
      results.push({
        title,
        location: "Mission District, San Francisco",
        date,
        time: null,
        description: null,
        source_url: null,
      });
    }
  }
  return results.slice(0, 10);
}

// ── Source fetchers ───────────────────────────────────────────────────────────

const OPENING_KEYWORDS =
  /\b(?:opens?|opened|openings?|debuts?|now open|coming soon|new restaurant|grand opening)\b/i;
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

function isEaterRoundupArticle(title: string, description: string): boolean {
  const combined = `${title} ${description}`;
  return /\b(?:openings|restaurants|bars|roundup|guide|map|where to eat)\b/i.test(
    combined,
  );
}

function isLikelyRestaurantHeading(text: string): boolean {
  const normalized = normalizeRestaurantName(text);
  if (!/\p{L}/u.test(normalized)) return false;
  if (normalized.length < 3 || normalized.length > 60) return false;
  if (normalized.split(/\s+/).length > 8) return false;
  if (
    /\b(?:more from eater|newsletter|share this story|map|where to eat|read more|comments?|latest|photos?|videos?|openings|restaurants|bars)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }
  return /\p{Lu}/u.test(normalized);
}

export function parseEaterArticle(
  html: string,
  existing: string[],
  sourceUrl: string | null,
  openedDate: string,
): NewRestaurant[] {
  const results: NewRestaurant[] = [];
  const headingRe = /<h[234][^>]*>([\s\S]*?)<\/h[234]>/gi;

  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html)) !== null) {
    const heading = stripHtml(match[1]);
    if (!isLikelyRestaurantHeading(heading)) continue;
    addRestaurantCandidate(results, existing, heading, openedDate, sourceUrl);
  }

  const knownNames = [
    ...existing,
    ...results.map((result) => result.name.toLowerCase()),
  ];
  for (const restaurant of extractRestaurants(stripHtml(html), knownNames)) {
    addRestaurantCandidate(
      results,
      existing,
      restaurant.name,
      openedDate,
      sourceUrl,
    );
  }

  return results;
}

/**
 * Is this item recent enough to consider? (within ~3 months)
 */
function isRecent(pubDate: string): boolean {
  if (!pubDate) return true; // if no date, include it
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return true;
  return Date.now() - d.getTime() < THREE_MONTHS_MS;
}

/**
 * Eater SF — Atom feed. Filter for opening-related articles.
 * Returns NewRestaurant candidates extracted from matching feed items.
 */
export async function fetchEaterSF(
  existing: string[],
): Promise<NewRestaurant[]> {
  const items = await fetchRss("https://sf.eater.com/rss/index.xml");
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const results: NewRestaurant[] = [];

  for (const item of items) {
    if (!isRecent(item.pubDate)) continue;
    const combined = `${item.title} ${item.description}`;
    if (!OPENING_KEYWORDS.test(combined)) continue;

    const knownNames = [
      ...existing,
      ...results.map((result) => result.name.toLowerCase()),
    ];
    const articleRestaurants = item.link
      ? parseEaterArticle(
          await fetchPageHtml(item.link),
          knownNames,
          item.link || null,
          month,
        )
      : [];

    if (articleRestaurants.length > 0) {
      results.push(...articleRestaurants);
      continue;
    }

    if (isEaterRoundupArticle(item.title, item.description)) {
      continue;
    }

    // Fall back only for single-restaurant stories.
    const name = item.title
      .replace(/\s*[-–|:,].*$/, "")
      .replace(/\s+(?:Opens?|Opened|Opening|Debuts?|Now Open).*/i, "")
      .trim();
    addRestaurantCandidate(results, existing, name, month, item.link || null);
  }

  return results;
}

/**
 * SFist — RSS 2.0 feed. Filter for SF restaurant opening articles.
 */
export async function fetchSFist(existing: string[]): Promise<NewRestaurant[]> {
  const items = await fetchRss("https://sfist.com/rss");
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const results: NewRestaurant[] = [];

  for (const item of items) {
    if (!isRecent(item.pubDate)) continue;
    const combined = `${item.title} ${item.description}`;
    // Must mention SF and be opening-related
    if (!OPENING_KEYWORDS.test(combined)) continue;
    if (!/san francisco|sf\b/i.test(combined)) continue;
    if (
      !/restaurant|bar|café|cafe|bakery|eatery|bistro|diner|pizzeria|ramen|sushi/i.test(
        combined,
      )
    )
      continue;

    const name = item.title
      .replace(/\s*[-–|:,].*$/, "")
      .replace(/\s+(?:Opens?|Opening|Debuts?|Now Open).*/i, "")
      .trim();
    if (
      name.length >= 3 &&
      !existing.includes(name.toLowerCase()) &&
      !results.find((x) => x.name === name)
    ) {
      results.push({
        name,
        neighborhood: "San Francisco",
        cuisine: "New opening",
        address: null,
        opened_date: month,
        source_url: item.link || null,
      });
    }
  }

  return results;
}

/**
 * Funcheap — RSS 2.0 feed. Returns SF event items.
 * Title format: "M/D/YY: Event Name - FREE" (strip prefix and suffix).
 */
export async function fetchFuncheap(existing: string[]): Promise<NewEvent[]> {
  const items = await fetchRss("https://sf.funcheap.com/feed/");
  const results: NewEvent[] = [];

  for (const item of items) {
    if (!isRecent(item.pubDate)) continue;

    // Parse the date prefix "M/D/YY: " from the title.
    let title = item.title;
    let date = item.pubDate;

    const prefixMatch = title.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}):\s*/);
    if (prefixMatch) {
      const [, month, day, year] = prefixMatch;
      const fullYear = year.length === 2 ? `20${year}` : year;
      const d = new Date(
        `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      );
      if (!isNaN(d.getTime())) {
        date = d.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      }
      title = title.slice(prefixMatch[0].length);
    }

    // Strip trailing " - FREE" suffix.
    title = title.replace(/\s*-\s*FREE\s*$/i, "").trim();

    if (
      title.length >= 3 &&
      !existing.includes(title.toLowerCase()) &&
      !results.find((e) => e.title === title)
    ) {
      results.push({
        title,
        location: "San Francisco",
        date,
        time: null,
        description: item.description || null,
        source_url: item.link || null,
      });
    }
  }

  return results;
}

/**
 * FAMSF (de Young + Legion of Honor) — scrape the calendar page.
 */
export async function fetchFAMSF(existing: string[]): Promise<NewEvent[]> {
  try {
    const res = await fetch("https://www.famsf.org/calendar", {
      headers: { "User-Agent": "sf-pulse-cron/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseFAMSFPage(html, existing);
  } catch {
    return [];
  }
}

/**
 * Parse FAMSF calendar HTML. Exported for testing with fixture HTML.
 * FAMSF renders event titles in elements like:
 *   <h3 class="...">Event Title</h3>
 *   with sibling date text nearby.
 * We extract h3 text and the nearest date-like string.
 */
export function parseFAMSFPage(html: string, existing: string[]): NewEvent[] {
  const results: NewEvent[] = [];
  // Match h2/h3/h4 headings that look like event titles (not generic nav/labels)
  const headingRe = /<h[234][^>]*>([\s\S]*?)<\/h[234]>/gi;
  // Date patterns like "April 5", "Saturday, April 5", "April 5–12", "April 5, 2026"
  const datePat =
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:[–\-]\d{1,2})?(?:,?\s+\d{4})?/i;

  let m;
  while ((m = headingRe.exec(html)) !== null) {
    const raw = stripHtml(m[1]);
    if (!raw || raw.length < 3 || raw.length > 120) continue;
    // Skip generic labels
    if (
      /^(?:highlights?|today|upcoming|calendar|events?|exhibitions?|tours?|talks?|performances?|parties|access days?)\s*$/i.test(
        raw,
      )
    )
      continue;

    // Look for a date in the next 400 characters after this heading
    const nearby = stripHtml(html.slice(m.index, m.index + 400));
    const dateMatch = nearby.match(datePat);
    const date = dateMatch ? dateMatch[0] : "See website";

    const title = raw.trim();
    if (
      !existing.includes(title.toLowerCase()) &&
      !results.find((e) => e.title === title)
    ) {
      results.push({
        title,
        location: "Fine Arts Museums of San Francisco",
        date,
        time: null,
        description: null,
        source_url: "https://www.famsf.org/calendar",
      });
    }
  }

  return results;
}

/**
 * California Academy of Sciences — scrape the events page.
 */
export async function fetchCalAcademy(existing: string[]): Promise<NewEvent[]> {
  try {
    const res = await fetch("https://www.calacademy.org/events", {
      headers: { "User-Agent": "sf-pulse-cron/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseCalAcademyPage(html, existing);
  } catch {
    return [];
  }
}

/**
 * Parse Cal Academy events HTML. Exported for testing.
 */
export function parseCalAcademyPage(
  html: string,
  existing: string[],
): NewEvent[] {
  const results: NewEvent[] = [];
  const datePat =
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?/i;
  const headingRe = /<h[234][^>]*>([\s\S]*?)<\/h[234]>/gi;

  let m;
  while ((m = headingRe.exec(html)) !== null) {
    const raw = stripHtml(m[1]);
    if (!raw || raw.length < 3 || raw.length > 120) continue;
    if (
      /^(?:events?|exhibits?|programs?|planetarium|calendar|featured)\s*$/i.test(
        raw,
      )
    )
      continue;

    const nearby = stripHtml(html.slice(m.index, m.index + 400));
    const dateMatch = nearby.match(datePat);
    const date = dateMatch ? dateMatch[0] : "See website";

    const title = raw.trim();
    if (
      !existing.includes(title.toLowerCase()) &&
      !results.find((e) => e.title === title)
    ) {
      results.push({
        title,
        location: "California Academy of Sciences, Golden Gate Park",
        date,
        time: null,
        description: null,
        source_url: "https://www.calacademy.org/events",
      });
    }
  }

  return results;
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
const GF_INFERRED =
  /\b(?:cauliflower crust|rice flour|gluten[\s-]?free option|can be made gf)\b/i;
const VEGAN_INFERRED =
  /\b(?:dairy[\s-]?free|no animal|vegan option|can be made vegan)\b/i;
const VEG_INFERRED =
  /\b(?:meatless|meat[\s-]?free|vegetable[\s-]?forward|vegetarian option)\b/i;

function checkDietary(
  confirmedRe: RegExp,
  inferredRe: RegExp,
  text: string,
): DietaryFlag {
  if (confirmedRe.test(text))
    return { available: true, confidence: "confirmed" };
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
    const menuSignals =
      /\b(?:menu|appetizer|entr[eé]e|dessert|salad|soup|pizza|pasta|burger|sandwich|bowl|plate|\$\d)\b/i;
    if (!menuSignals.test(text)) continue;

    const flags = parseDietaryFlags(text);
    return { menuUrl: url, dietaryFlags: flags };
  }

  // Couldn't find a parseable menu — mark as checked with no results
  return { menuUrl: urls[0] ?? null, dietaryFlags: defaultFlags };
}

// ── DB list helpers ───────────────────────────────────────────────────────────

/**
 * Unwrap a PromiseSettledResult, logging a warning on rejection.
 * Returns the fulfilled value or the provided fallback.
 */
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

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[cron] SF Pulse refresh — ${new Date().toISOString()}`);

  const lists = await currentLists();
  const now = new Date();
  const monthYear = now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  // ── Restaurant sources ──────────────────────────────────────────────────────
  console.log("[cron] fetching restaurant sources...");
  const [eaterResult, sfistResult, ddgRResult] = await Promise.allSettled([
    fetchEaterSF(lists.restaurantNames),
    fetchSFist(lists.restaurantNames),
    searchWeb(`new restaurant openings San Francisco ${monthYear}`),
  ]);

  const eaterItems = settled(eaterResult, "Eater SF", [] as NewRestaurant[]);
  const sfistItems = settled(sfistResult, "SFist", [] as NewRestaurant[]);
  const ddgRHtml = settled(ddgRResult, "DuckDuckGo (restaurants)", "");
  const ddgRestaurants = extractRestaurants(
    stripHtml(ddgRHtml),
    lists.restaurantNames,
  );

  // Merge, dedup by lowercased name.
  const seenNames = new Set<string>(lists.restaurantNames);
  const newRestaurants: NewRestaurant[] = [];
  for (const r of [...eaterItems, ...sfistItems, ...ddgRestaurants]) {
    const key = r.name.toLowerCase();
    if (!seenNames.has(key)) {
      seenNames.add(key);
      newRestaurants.push(r);
    }
  }

  // ── Event sources ───────────────────────────────────────────────────────────
  console.log("[cron] fetching event sources...");
  const [funcheapResult, famsfResult, calAcademyResult, ddgEResult] =
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
  const ddgEHtml = settled(ddgEResult, "DuckDuckGo (events)", "");
  const ddgEvents = extractEvents(stripHtml(ddgEHtml), lists.eventTitles);

  const seenTitles = new Set<string>(lists.eventTitles);
  const newEvents: NewEvent[] = [];
  for (const e of [
    ...funcheapItems,
    ...famsfItems,
    ...calAcademyItems,
    ...ddgEvents,
  ]) {
    const key = e.title.toLowerCase();
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      newEvents.push(e);
    }
  }

  console.log(
    `[cron] candidates: ${newRestaurants.length} restaurants, ${newEvents.length} events`,
  );

  if (newRestaurants.length > 0 || newEvents.length > 0) {
    const res = await fetch(`${APP_URL}/api/cron/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": CRON_SECRET,
      },
      body: JSON.stringify({ restaurants: newRestaurants, events: newEvents }),
    });
    console.log("[cron] refresh response:", await res.json());
  } else {
    console.log("[cron] nothing new");
  }

  // ── Phase 2: Menu discovery ─────────────────────────────────────────────────
  console.log("[cron] starting menu discovery...");
  try {
    const menuRes = await fetch(
      `${APP_URL}/api/restaurants/needing-menu-check`,
      {
        headers: { "x-cron-secret": CRON_SECRET },
      },
    );
    if (menuRes.ok) {
      const toCheck: { id: number; name: string }[] = await menuRes.json();
      console.log(`[cron] ${toCheck.length} restaurants need menu check`);

      // Process sequentially to avoid hammering search engines
      for (const r of toCheck) {
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
          console.info(`[cron] found menu for ${r.name}`);
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
const isMain =
  process.argv[1]?.endsWith("cron-refresh.ts") ||
  process.argv[1]?.endsWith("cron.cjs");
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
