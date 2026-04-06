import { MONTH_NAME_PATTERN } from "./constants.js";
import { normalizeWhitespace, stripHtml } from "./html.js";
import { fetchPageHtml, searchWeb } from "./http.js";
import { isRecent } from "./recency.js";
import { fetchRss } from "./rss.js";
import { normalizeDateText } from "../../shared/dates.ts";
import type { NewRestaurant } from "./types.js";

const OPENING_KEYWORDS =
  /\b(?:opens?|opened|openings?|debuts?|now open|coming soon|new restaurant|grand opening)\b/i;
const GENERIC_RESTAURANT_TITLE_RE =
  /^(?:more from eater(?: sf)?|newsletter|share this story|map|where to eat|read more|comments?|latest|photos?|videos?|openings|restaurants|bars|see more|more maps(?: in eater sf)?|more in .+|most popular|the latest|eater sf)\s*$/i;
const DATE_ONLY_RESTAURANT_TITLE_RE = new RegExp(
  `^(?:(?:${MONTH_NAME_PATTERN})\\s+\\d{1,2}(?:\\s*[–-]\\s*\\d{1,2})?(?:,\\s*\\d{4})?|(?:${MONTH_NAME_PATTERN})\\s+\\d{4})$`,
  "i",
);
const ROUNDUP_LOCATION_PREFIX_RE = /^[A-Z0-9&/.' -]{2,40}\s+—\s+/;
const ROUNDUP_VENUE_HINT_RE =
  /\b(?:restaurant|bar|bakery|cafe|café|pub|deli|bistro|eatery|brasserie|brewery|wine bar|food hall|coffee shop|spot|grill|kitchen)\b/i;
const NEWS_OUTLET_RE =
  /\b(?:Eater(?: SF)?|Hoodline|East Bay Nosh|Berkeleyside|SFGATE|San Francisco Chronicle|SF Chronicle|San Francisco Standard|Mercury News|Sonoma Magazine)\b/i;
const MICHELIN_PUBLICATION_QUERY =
  'site:michelin.com/en/publications/products-and-services "MICHELIN Guide California" selection';

export function extractRestaurants(
  text: string,
  existing: string[],
): NewRestaurant[] {
  const month = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const results: NewRestaurant[] = [];
  const pattern =
    /["']([A-Z][^"']{2,40})["']\s*(?:opens?|opened|opening|debuts?|now open)/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (
      !existing.includes(name.toLowerCase()) &&
      !results.find((restaurant) => restaurant.name === name)
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
): void {
  const normalized = normalizeRestaurantName(name);
  if (normalized.length < 3) return;
  if (existing.includes(normalized.toLowerCase())) return;
  if (
    results.find((restaurant) => restaurant.name.toLowerCase() === normalized.toLowerCase())
  ) {
    return;
  }

  results.push({
    name: normalized,
    neighborhood: "San Francisco",
    cuisine: "New opening",
    address: null,
    opened_date: openedDate,
    source_url: sourceUrl,
  });
}

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
  if (GENERIC_RESTAURANT_TITLE_RE.test(normalized)) return false;
  if (DATE_ONLY_RESTAURANT_TITLE_RE.test(normalized)) return false;
  return /\p{Lu}/u.test(normalized);
}

function scoreRoundupAnchorCandidate(
  beforeText: string,
  afterText: string,
): number {
  let score = 0;

  if (/\b(?:opening of|new)\s*$/i.test(beforeText)) score += 4;
  if (/\b(?:the|a|an)\s+new\s*$/i.test(beforeText)) score += 3;
  if (
    /\b(?:restaurant|bar|bakery|cafe|café|pub|deli|bistro|brewery|wine bar|food hall)\s*$/i.test(
      beforeText,
    )
  ) {
    score += 2;
  }
  if (/^\s*(?:is|are|opens?|opened|opening|debuts?|returns?|lands?)\b/i.test(afterText)) {
    score += 4;
  }
  if (ROUNDUP_VENUE_HINT_RE.test(afterText.slice(0, 120))) score += 2;
  if (/^\s*reports\b/i.test(afterText)) score -= 4;

  return score;
}

function extractRoundupParagraphRestaurants(
  html: string,
  existing: string[],
  results: NewRestaurant[],
  openedDate: string,
  sourceUrl: string | null,
): void {
  const paragraphRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let paragraphMatch: RegExpExecArray | null;

  while ((paragraphMatch = paragraphRe.exec(html)) !== null) {
    const paragraphHtml = paragraphMatch[1];
    const paragraphText = normalizeWhitespace(stripHtml(paragraphHtml));
    if (!ROUNDUP_LOCATION_PREFIX_RE.test(paragraphText)) continue;
    if (!OPENING_KEYWORDS.test(paragraphText)) continue;

    const anchorRe = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
    let anchorMatch: RegExpExecArray | null;
    let bestCandidate: { name: string; score: number } | null = null;

    while ((anchorMatch = anchorRe.exec(paragraphHtml)) !== null) {
      const name = normalizeRestaurantName(stripHtml(anchorMatch[1]));
      if (!isLikelyRestaurantHeading(name)) continue;
      if (NEWS_OUTLET_RE.test(name)) continue;

      const beforeText = normalizeWhitespace(
        stripHtml(
          paragraphHtml.slice(Math.max(0, anchorMatch.index - 120), anchorMatch.index),
        ),
      );
      const anchorEnd = anchorMatch.index + anchorMatch[0].length;
      const afterText = normalizeWhitespace(
        stripHtml(paragraphHtml.slice(anchorEnd, anchorEnd + 160)),
      );
      const score = scoreRoundupAnchorCandidate(beforeText, afterText);
      if (score < 4) continue;

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { name, score };
      }
    }

    if (!bestCandidate) continue;
    addRestaurantCandidate(
      results,
      existing,
      bestCandidate.name,
      openedDate,
      sourceUrl,
    );
  }
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

  extractRoundupParagraphRestaurants(
    html,
    existing,
    results,
    openedDate,
    sourceUrl,
  );

  const knownNames = [
    ...existing,
    ...results.map((restaurant) => restaurant.name.toLowerCase()),
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

export async function fetchEaterSF(
  existing: string[],
): Promise<NewRestaurant[]> {
  const items = await fetchRss("https://sf.eater.com/rss/index.xml");
  const month = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const results: NewRestaurant[] = [];

  for (const item of items) {
    if (!isRecent(item.pubDate)) continue;
    const combined = `${item.title} ${item.description}`;
    if (!OPENING_KEYWORDS.test(combined)) continue;

    const knownNames = [
      ...existing,
      ...results.map((restaurant) => restaurant.name.toLowerCase()),
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

    if (isEaterRoundupArticle(item.title, item.description)) continue;

    const name = item.title
      .replace(/\s*[-–|:,].*$/, "")
      .replace(/\s+(?:Opens?|Opened|Opening|Debuts?|Now Open).*/i, "")
      .trim();
    addRestaurantCandidate(results, existing, name, month, item.link || null);
  }

  return results;
}

export async function fetchSFist(existing: string[]): Promise<NewRestaurant[]> {
  const items = await fetchRss("https://sfist.com/rss");
  const month = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const results: NewRestaurant[] = [];

  for (const item of items) {
    if (!isRecent(item.pubDate)) continue;
    const combined = `${item.title} ${item.description}`;
    if (!OPENING_KEYWORDS.test(combined)) continue;
    if (!/san francisco|sf\b/i.test(combined)) continue;
    if (
      !/restaurant|bar|café|cafe|bakery|eatery|bistro|diner|pizzeria|ramen|sushi/i.test(
        combined,
      )
    ) {
      continue;
    }

    const name = item.title
      .replace(/\s*[-–|:,].*$/, "")
      .replace(/\s+(?:Opens?|Opening|Debuts?|Now Open).*/i, "")
      .trim();
    if (
      name.length >= 3 &&
      !existing.includes(name.toLowerCase()) &&
      !results.find((restaurant) => restaurant.name === name)
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function michelinPublicationUrl(year: number): string {
  return `https://www.michelin.com/en/publications/products-and-services/michelin-guide-california-${year}-selection`;
}

function michelinStarCount(heading: string): number | null {
  if (/^One MICHELIN Star$/i.test(heading)) return 1;
  if (/^Two MICHELIN Stars$/i.test(heading)) return 2;
  if (/^Three MICHELIN Stars$/i.test(heading)) return 3;
  return null;
}

function parseMichelinPublicationDate(lines: string[]): string | null {
  const raw = lines.find((line) => /^\d{2}-\d{2}-\d{4}$/.test(line));
  if (!raw) return null;

  const [month, day, year] = raw.split("-").map((part) => Number.parseInt(part, 10));
  if (!day || !month || !year) return null;

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function michelinHtmlToLines(html: string): string[] {
  return html
    .replace(/<\/(?:p|span|div|li|h1|h2|h3|h4|h5|h6|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map((line) => normalizeWhitespace(decodeHtmlEntities(line)))
    .filter(Boolean);
}

export function parseMichelinSelectionPage(
  html: string,
  sourceUrl: string,
): NewRestaurant[] {
  const lines = michelinHtmlToLines(html);
  const publishedAt = parseMichelinPublicationDate(lines);
  if (!publishedAt) return [];

  const results: NewRestaurant[] = [];
  const seen = new Set<string>();
  let stars: number | null = null;

  for (const line of lines) {
    const nextStars = michelinStarCount(line);
    if (nextStars !== null) {
      stars = nextStars;
      continue;
    }

    if (stars === null) continue;
    if (/^Green Star|^Bib Gourmand|^Special Awards?/i.test(line)) {
      stars = null;
      continue;
    }

    const match = line.match(/^(.+?)\s+\((San Francisco)(?:;[^)]*)?\)$/);
    if (!match) continue;

    const name = normalizeWhitespace(match[1]);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      name,
      neighborhood: "San Francisco",
      cuisine: `Michelin ${stars}-star recognition`,
      address: null,
      opened_date: `${stars} ${stars === 1 ? "star" : "stars"} · ${publishedAt}`,
      highlight_kind: "michelin",
      source_url: sourceUrl,
    });
  }

  return results;
}

export function extractMichelinPublicationUrls(searchHtml: string): string[] {
  const urls = new Set<string>();

  const directUrlRe =
    /https:\/\/www\.michelin\.com\/en\/publications\/products-and-services\/michelin-guide-california-[^"'\s<]+/gi;
  let directMatch: RegExpExecArray | null;
  while ((directMatch = directUrlRe.exec(searchHtml)) !== null) {
    urls.add(directMatch[0]);
  }

  const encodedUrlRe = /uddg=([^"&\s>]+)/gi;
  let encodedMatch: RegExpExecArray | null;
  while ((encodedMatch = encodedUrlRe.exec(searchHtml)) !== null) {
    const decoded = decodeURIComponent(encodedMatch[1]);
    if (decoded.startsWith("https://www.michelin.com/en/publications/products-and-services/")) {
      urls.add(decoded);
    }
  }

  return [...urls];
}

export async function fetchMichelinCaliforniaSelection(
  reference = new Date(),
): Promise<NewRestaurant[]> {
  const candidateUrls = [
    michelinPublicationUrl(reference.getUTCFullYear()),
    michelinPublicationUrl(reference.getUTCFullYear() - 1),
  ];

  for (const url of candidateUrls) {
    const parsed = parseMichelinSelectionPage(await fetchPageHtml(url), url);
    if (parsed.length > 0) {
      return parsed.map((restaurant) => ({
        ...restaurant,
        opened_date: normalizeDateText(restaurant.opened_date, reference),
      }));
    }
  }

  try {
    const searchHtml = await searchWeb(MICHELIN_PUBLICATION_QUERY);
    for (const url of extractMichelinPublicationUrls(searchHtml)) {
      const parsed = parseMichelinSelectionPage(await fetchPageHtml(url), url);
      if (parsed.length > 0) {
        return parsed.map((restaurant) => ({
          ...restaurant,
          opened_date: normalizeDateText(restaurant.opened_date, reference),
        }));
      }
    }
  } catch {
    // Ignore fallback search failures; Michelin adds are best-effort.
  }

  return [];
}
