import {
  MONTH_NAME_PATTERN,
  WEEKDAY_PATTERN,
  CRON_USER_AGENT,
} from "./constants.js";
import {
  escapeHtml,
  normalizeWhitespace,
  stripHtml,
  stripParsingNoiseHtml,
} from "./html.js";
import { isRecent } from "./recency.js";
import { fetchRss } from "./rss.js";
import type { NewEvent } from "./types.js";

const EXACT_EVENT_DATE_PATTERN =
  `(?:(${WEEKDAY_PATTERN}),?\\s+)?` +
  `(?:${MONTH_NAME_PATTERN})\\s+\\d{1,2}(?:\\s*[–-]\\s*\\d{1,2})?(?:,\\s*\\d{4})?`;
const GENERIC_EVENT_TITLE_RE =
  /^(?:highlights?|today|upcoming|calendar|events?|exhibitions?|exhibits?|tours?|talks?|performances?|parties|access days?|featured(?: events?)?|programs?|planetarium|visit|hours|tickets?|membership|donate|shop|search|menu|about|learn|support|collections?|plan your visit|what'?s on|see all|view all|read more|new & featured|iconic exhibits|ongoing exhibits|hands-on exhibits)\s*$/i;
const DATE_ONLY_TITLE_RE = new RegExp(
  `^(?:${EXACT_EVENT_DATE_PATTERN}|(?:${MONTH_NAME_PATTERN})\\s+\\d{4})$`,
  "i",
);
const SEARCHISH_EVENT_TITLE_RE =
  /^(?=.*\b(?:san francisco|golden gate park)\b)(?=.*\b(?:events?|concerts?|calendar|things to do|weekend)\b).*/i;
const WEEKDAY_ONLY_TITLE_RE = new RegExp(
  `^(?:${WEEKDAY_PATTERN})(?:\\s+on)?$`,
  "i",
);

function normalizeExtractedEventTitle(value: string): string {
  return normalizeWhitespace(value).replace(/\s+on$/i, "");
}

function isLikelyFallbackEventTitle(title: string): boolean {
  const normalized = normalizeExtractedEventTitle(title);
  if (!normalized) return false;
  if (normalized.length < 4 || normalized.length > 80) return false;
  if (WEEKDAY_ONLY_TITLE_RE.test(normalized)) return false;
  if (GENERIC_EVENT_TITLE_RE.test(normalized)) return false;
  if (DATE_ONLY_TITLE_RE.test(normalized)) return false;
  if (SEARCHISH_EVENT_TITLE_RE.test(normalized)) return false;
  return true;
}

export function extractEvents(text: string, existing: string[]): NewEvent[] {
  const results: NewEvent[] = [];
  const pattern = new RegExp(
    `([A-Z][A-Za-z &:'’\\-]{4,60}?)\\s+(?:on\\s+|[–-]\\s*)?((?:${MONTH_NAME_PATTERN})\\s+\\d{1,2}(?!\\d)(?:,?\\s+\\d{4})?)`,
    "g",
  );
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const title = escapeHtml(normalizeExtractedEventTitle(match[1]));
    const date = match[2].trim();
    if (!isLikelyFallbackEventTitle(title)) continue;
    if (
      !existing.includes(title.toLowerCase()) &&
      !results.find((event) => event.title === title)
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

function isLikelyMuseumEventTitle(
  title: string,
  ignoredTitleRe: RegExp,
): boolean {
  const normalized = normalizeWhitespace(title);
  if (!normalized) return false;
  if (normalized.length < 4 || normalized.length > 120) return false;
  if (!/\p{L}/u.test(normalized)) return false;
  if (normalized.split(/\s+/).length > 12) return false;
  if (GENERIC_EVENT_TITLE_RE.test(normalized)) return false;
  if (DATE_ONLY_TITLE_RE.test(normalized)) return false;
  if (ignoredTitleRe.test(normalized)) return false;
  return true;
}

function extractNearbyExactDate(
  windowText: string,
  title: string,
): string | null {
  const normalizedWindow = normalizeWhitespace(windowText);
  const normalizedTitle = normalizeWhitespace(title);
  const titleIndex = normalizedWindow.indexOf(normalizedTitle);
  if (titleIndex === -1) return null;

  const datePattern = new RegExp(EXACT_EVENT_DATE_PATTERN, "gi");
  let bestMatch: { date: string; distance: number } | null = null;
  let match: RegExpExecArray | null;

  while ((match = datePattern.exec(normalizedWindow)) !== null) {
    const distance = Math.min(
      Math.abs(match.index - titleIndex),
      Math.abs(
        match.index + match[0].length - (titleIndex + normalizedTitle.length),
      ),
    );
    if (distance > 240) continue;

    const date = normalizeWhitespace(match[0]).replace(/\s*([–-])\s*/g, " $1 ");
    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { date, distance };
    }
  }

  return bestMatch?.date ?? null;
}

function parseMuseumEvents(
  html: string,
  existing: string[],
  options: {
    ignoredTitleRe: RegExp;
    location: string;
    sourceUrl: string;
    headingLevels: string;
  },
): NewEvent[] {
  const cleanedHtml = stripParsingNoiseHtml(html);
  const headingRe = new RegExp(
    `<h([${options.headingLevels}])[^>]*>([\\s\\S]*?)<\\/h\\1>`,
    "gi",
  );
  const headings: {
    index: number;
    end: number;
    title: string;
    isCandidate: boolean;
  }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRe.exec(cleanedHtml)) !== null) {
    const title = normalizeWhitespace(stripHtml(match[2]));
    headings.push({
      index: match.index,
      end: match.index + match[0].length,
      title,
      isCandidate: isLikelyMuseumEventTitle(title, options.ignoredTitleRe),
    });
  }

  const results: NewEvent[] = [];
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    if (!heading.isCandidate) continue;

    const nextHeadingIndex = headings[index + 1]?.index ?? cleanedHtml.length;
    const windowEnd = Math.min(nextHeadingIndex, heading.end + 1200);
    const windowText = stripHtml(cleanedHtml.slice(heading.index, windowEnd));
    const date = extractNearbyExactDate(windowText, heading.title);
    if (!date) continue;

    const escapedTitle = escapeHtml(heading.title);
    const titleKey = escapedTitle.toLowerCase();
    if (existing.includes(titleKey)) continue;
    if (results.find((event) => event.title.toLowerCase() === titleKey)) {
      continue;
    }

    results.push({
      title: escapedTitle,
      location: options.location,
      date,
      time: null,
      description: null,
      source_url: options.sourceUrl,
    });
  }

  return results;
}

export async function fetchFuncheap(existing: string[]): Promise<NewEvent[]> {
  const items = await fetchRss("https://sf.funcheap.com/feed/");
  const results: NewEvent[] = [];

  for (const item of items) {
    if (!isRecent(item.pubDate)) continue;

    let title = item.title;
    let date = item.pubDate;
    const prefixMatch = title.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}):\s*/);
    if (prefixMatch) {
      const [, month, day, year] = prefixMatch;
      const fullYear = year.length === 2 ? `20${year}` : year;
      const parsed = new Date(
        Number(fullYear),
        Number(month) - 1,
        Number(day),
      );
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      }
      title = title.slice(prefixMatch[0].length);
    }

    title = escapeHtml(title.replace(/\s*-\s*FREE\s*$/i, "").trim());
    if (
      title.length >= 3 &&
      !existing.includes(title.toLowerCase()) &&
      !results.find((event) => event.title === title)
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

export async function fetchFAMSF(existing: string[]): Promise<NewEvent[]> {
  try {
    const res = await fetch("https://www.famsf.org/calendar", {
      headers: { "User-Agent": CRON_USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    return parseFAMSFPage(await res.text(), existing);
  } catch {
    return [];
  }
}

export function parseFAMSFPage(html: string, existing: string[]): NewEvent[] {
  return parseMuseumEvents(html, existing, {
    ignoredTitleRe:
      /^(?:de young|legion of honor|tickets?|hours|museum map|visitor information)$/i,
    location: "Fine Arts Museums of San Francisco",
    sourceUrl: "https://www.famsf.org/calendar",
    headingLevels: "34",
  });
}

export async function fetchCalAcademy(existing: string[]): Promise<NewEvent[]> {
  try {
    const res = await fetch("https://www.calacademy.org/events", {
      headers: { "User-Agent": CRON_USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    return parseCalAcademyPage(await res.text(), existing);
  } catch {
    return [];
  }
}

export function parseCalAcademyPage(
  html: string,
  existing: string[],
): NewEvent[] {
  return parseMuseumEvents(html, existing, {
    ignoredTitleRe:
      /^(?:planetarium|aquarium|rainforest|nightlife|today at the academy|museum map)$/i,
    location: "California Academy of Sciences, Golden Gate Park",
    sourceUrl: "https://www.calacademy.org/events",
    headingLevels: "234",
  });
}
