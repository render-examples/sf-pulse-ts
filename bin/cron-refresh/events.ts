import {
  MONTH_NAME_PATTERN,
  WEEKDAY_PATTERN,
  CRON_USER_AGENT,
} from "./constants.js";
import {
  decodeHtmlEntitiesRecursive,
  normalizeEscapedHtmlText,
  normalizeWhitespace,
  stripHtml,
  stripParsingNoiseHtml,
} from "./html.js";
import { isRecent } from "./recency.js";
import { fetchRss } from "./rss.js";
import type { NewEvent } from "./types.js";
import { normalizeDateText } from "../../shared/dates.ts";
import { buildEventIdentityKey } from "../../shared/event-identity.ts";
import { fetchPageHtml } from "./http.js";

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

function normalizeFuncheapTitleAndDate(
  title: string,
  date: string,
): { title: string; date: string } {
  const normalizedTitle = normalizeWhitespace(decodeHtmlEntitiesRecursive(title));
  const match = normalizedTitle.match(
    new RegExp(
      `^(.*?)\\s*\\(((?:${MONTH_NAME_PATTERN})\\s+\\d{1,2}(?:\\s*[–-]\\s*\\d{1,2})?(?:,\\s*\\d{4})?)\\)\\s*$`,
      "i",
    ),
  );
  if (!match) {
    return { title: normalizedTitle, date };
  }

  let nextTitle = normalizeWhitespace(match[1]);
  const year =
    match[2].match(/\b(20\d{2})\b/)?.[1] ??
    normalizedTitle.match(/\b(20\d{2})\b/)?.[1] ??
    null;
  const nextDate = normalizeDateText(
    year && !/\b20\d{2}\b/.test(match[2]) ? `${match[2]}, ${year}` : match[2],
  ).replace(/\s*-\s*/g, "–");

  if (year) {
    nextTitle = normalizeWhitespace(
      nextTitle.replace(new RegExp(`\\s+${year}$`), ""),
    );
  }

  return { title: nextTitle, date: nextDate };
}

function stripFuncheapAttribution(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/\s*The post .*? appeared first on Funcheap\s*\.\s*$/i, "")
      .replace(/^Original Event Description:\s*/i, "")
      .replace(/\s*Read more\.\.\.\s*$/i, ""),
  );
}

function extractJsonScripts(html: string): unknown[] {
  const matches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const results: unknown[] = [];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      results.push(JSON.parse(raw));
    } catch {
      // Ignore invalid blobs.
    }
  }

  return results;
}

function extractMetaContent(html: string, attr: "name" | "property", value: string): string | null {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]*${attr}=["']${escapedValue}["'][^>]*content=["']([\\s\\S]*?)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]*content=["']([\\s\\S]*?)["'][^>]*${attr}=["']${escapedValue}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntitiesRecursive(match[1]);
    }
  }

  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flattenJsonNodes(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenJsonNodes(entry));
  }

  const record = value as Record<string, unknown>;
  const graph = record["@graph"];
  if (Array.isArray(graph)) {
    return graph.flatMap((entry) => flattenJsonNodes(entry));
  }

  return [record];
}

function isEventJsonNode(value: Record<string, unknown>): boolean {
  const type = value["@type"];
  if (Array.isArray(type)) {
    return type.includes("Event");
  }
  return type === "Event";
}

function jsonNodeString(value: unknown): string | null {
  return typeof value === "string" ? decodeHtmlEntitiesRecursive(value) : null;
}

function normalizeLocationToken(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\bcalifornia\b/g, "ca");
}

function jsonNodeLocation(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = jsonNodeString(record.name);
  const addressValue = record.address;
  const address =
    typeof addressValue === "string"
      ? decodeHtmlEntitiesRecursive(addressValue)
      : addressValue && typeof addressValue === "object"
        ? [
            jsonNodeString((addressValue as Record<string, unknown>).streetAddress),
            jsonNodeString((addressValue as Record<string, unknown>).addressLocality),
            jsonNodeString((addressValue as Record<string, unknown>).addressRegion),
          ]
            .filter(Boolean)
            .join(", ")
        : null;
  const normalizedName = name ? normalizeLocationToken(name) : null;
  const normalizedAddress = address ? normalizeLocationToken(address) : null;
  const rawParts =
    normalizedName && normalizedAddress?.includes(normalizedName)
      ? [address]
      : [name, address];
  const parts = rawParts.filter((part, index, array): part is string => {
    if (!part) {
      return false;
    }

    const normalizedPart = normalizeLocationToken(part);
    return (
      array.findIndex((candidate) => {
        if (!candidate) {
          return false;
        }

        const normalizedCandidate = normalizeLocationToken(candidate);
        return (
          normalizedCandidate === normalizedPart ||
          normalizedCandidate.includes(normalizedPart) ||
          normalizedPart.includes(normalizedCandidate)
        );
      }) === index
    );
  });
  return normalizeWhitespace(parts.join(", ")) || null;
}

function formatFuncheapDate(startDate: string, endDate: string | null): string {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) {
    return normalizeDateText(startDate);
  }

  const end = endDate ? new Date(endDate) : null;
  const zonedDateKey = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "America/Los_Angeles",
    }).format(value);
  const sameDay =
    end &&
    !Number.isNaN(end.getTime()) &&
    zonedDateKey(start) === zonedDateKey(end);

  if (!end || sameDay) {
    return start.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Los_Angeles",
    });
  }

  const startMonth = start.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
  const endMonth = end.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
  return `${startMonth} – ${endMonth}`;
}

function formatFuncheapTime(startDate: string, endDate: string | null): string | null {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const end = endDate ? new Date(endDate) : null;
  const startText = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });

  if (!end || Number.isNaN(end.getTime())) {
    return startText;
  }

  const endText = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
  return `${startText} – ${endText}`;
}

function normalizeFuncheapDescription(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const cleaned = normalizeWhitespace(
    decodeHtmlEntitiesRecursive(value)
      .replace(/\.entry img\.fc-img-auto-add\s*\{[\s\S]*?\}/gi, " ")
      .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^@[a-z0-9_]+\s*/i, "")
      .replace(/^Submitted by the Event Organizer/i, "")
      .replace(/^Original Event Description:\s*/i, "")
      .replace(/Original Event Description:[\s\S]*$/i, "")
      .replace(/Text extracted from provided image:[\s\S]*$/i, "")
      .replace(/\bUpcoming\s+.+?\s+Events\b[\s\S]*$/i, "")
      .replace(/Disclaimer: Please double check.*$/i, "")
      .replace(/Updated \d+\/\d+\/\d+.*$/i, "")
      .replace(/Upcoming .* Events.*$/i, ""),
  );
  const stripped = normalizeEscapedHtmlText(stripFuncheapAttribution(cleaned));
  const withoutCredit = stripped.replace(
    /^((?:[A-Z][\w'.&-]*|[A-Z]{2,})(?:\s+(?:[A-Z][\w'.&-]*|[A-Z]{2,})){0,3})\s+(?=(?:A|An|Bring|Celebrate|Come|Discover|Enjoy|Explore|Find|Join|Learn|Spend|The|This)\b)/,
    "",
  );
  return withoutCredit || null;
}

function titleKeywords(title: string): string[] {
  const stopWords = new Set([
    "2026",
    "and",
    "block",
    "event",
    "food",
    "free",
    "open",
    "party",
    "sf",
    "the",
  ]);

  return [...new Set(
    normalizeWhitespace(decodeHtmlEntitiesRecursive(title))
      .toLowerCase()
      .match(/[a-z0-9]{4,}/g)
      ?.filter((token) => !stopWords.has(token)) ?? [],
  )];
}

function trimLeadingFuncheapContext(value: string, title: string): string {
  const cleaned = normalizeWhitespace(value);
  const prefixMatch = cleaned.match(
    /^((?:[A-Z][\w'.&-]*|[A-Z]{2,})(?:\s+(?:[A-Z][\w'.&-]*|[A-Z]{2,})){0,3})\s+(.+)$/,
  );
  if (!prefixMatch) {
    return cleaned;
  }

  const sentenceStarters = new Set([
    "a",
    "an",
    "bring",
    "celebrate",
    "come",
    "discover",
    "enjoy",
    "explore",
    "find",
    "join",
    "learn",
    "looking",
    "spend",
    "the",
    "this",
  ]);
  const prefixTokens = prefixMatch[1].split(/\s+/);
  if (sentenceStarters.has(prefixTokens[0]?.toLowerCase() ?? "")) {
    return cleaned;
  }
  const prefixKeywords = prefixMatch[1].toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  if (
    prefixKeywords.length > 0 &&
    prefixKeywords.every((token) => titleKeywords(title).includes(token))
  ) {
    return cleaned;
  }
  if (
    !prefixMatch[1].includes(" ") &&
    titleKeywords(title).includes(prefixMatch[1].toLowerCase())
  ) {
    return cleaned;
  }

  const remainder = prefixMatch[2];
  const keywordHits = titleKeywords(title).filter((token) =>
    remainder.toLowerCase().includes(token),
  ).length;

  return keywordHits >= 2 ? remainder : cleaned;
}

function finalizeFuncheapDescription(value: string, title: string): string {
  const normalizedTitle = normalizeWhitespace(decodeHtmlEntitiesRecursive(title));
  let cleaned = normalizeWhitespace(value);
  if (normalizedTitle) {
    cleaned = cleaned.replace(
      new RegExp(`^${escapeRegex(normalizedTitle)}\\s*[:\\-–—]?\\s*`, "i"),
      "",
    );
    cleaned = cleaned.replace(
      new RegExp(`\\bUpcoming\\s+${escapeRegex(normalizedTitle)}\\s+Events\\b[\\s\\S]*$`, "i"),
      "",
    );

    const repeatedTitleIndex = cleaned
      .toLowerCase()
      .indexOf(normalizedTitle.toLowerCase());
    if (repeatedTitleIndex > 80) {
      cleaned = cleaned.slice(0, repeatedTitleIndex).trim();
    }
  }

  return normalizeWhitespace(cleaned);
}

function scoreFuncheapDescription(value: string, title: string): number {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = Math.min(normalized.length, 320);
  const keywordMatches = titleKeywords(title).filter((token) =>
    normalized.toLowerCase().includes(token),
  ).length;
  score += keywordMatches * 30;
  if (normalized.length < 40) {
    score -= 80;
  }
  if (/\b(?:celebrate|enjoy|join|spend)\b/i.test(normalized)) {
    score += 20;
  }
  if (/[.!?]["”']?$/.test(normalized)) {
    score += 20;
  }
  if (
    /Original Event Description|Text extracted from provided image|appeared first on Funcheap|\.entry img\.fc-img/i.test(
      normalized,
    )
  ) {
    score -= 200;
  }
  if (
    /\b(?:cheap-aholic|founder of Fun Cheap|has been featured on|Johnny is a self-described)\b/i.test(
      normalized,
    )
  ) {
    score -= 300;
  }
  if (/^@[a-z0-9_]+/i.test(normalized)) {
    score -= 120;
  }

  return score;
}

function selectFuncheapDescription(
  html: string,
  nodes: Record<string, unknown>[],
  eventNode: Record<string, unknown>,
  title: string,
): string | null {
  const candidates = [
    extractMetaContent(html, "property", "og:description"),
    extractMetaContent(html, "name", "description"),
    ...nodes
      .filter((node) => node !== eventNode)
      .map((node) => jsonNodeString(node.description)),
    extractFuncheapDescription(funcheapHtmlToLines(html)),
    jsonNodeString(eventNode.description),
  ]
    .map((candidate) => normalizeFuncheapDescription(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));

  if (candidates.length === 0) {
    return null;
  }

  return trimLeadingFuncheapContext(
    finalizeFuncheapDescription(
      candidates.reduce((best, candidate) =>
    scoreFuncheapDescription(candidate, title) >
      scoreFuncheapDescription(best, title)
      ? candidate
      : best,
      ),
      title,
    ),
    title,
  );
}

function parseFuncheapJsonLdEvent(html: string, sourceUrl: string): NewEvent | null {
  const nodes = extractJsonScripts(html).flatMap((value) => flattenJsonNodes(value));
  const eventNode = nodes.find((node) => isEventJsonNode(node));
  if (!eventNode) {
    return null;
  }

  const title = jsonNodeString(eventNode.name);
  const startDate = jsonNodeString(eventNode.startDate);
  const endDate = jsonNodeString(eventNode.endDate);
  const location = jsonNodeLocation(eventNode.location) ?? "San Francisco";
  if (!title || !startDate) {
    return null;
  }

  if (isNonSanFranciscoFuncheapEvent(title, location)) {
    return null;
  }

  const normalized = normalizeFuncheapTitleAndDate(
    title,
    formatFuncheapDate(startDate, endDate),
  );

  return {
    title: normalizeEscapedHtmlText(normalized.title),
    location: normalizeWhitespace(location),
    date: normalized.date,
    time: formatFuncheapTime(startDate, endDate),
    description: selectFuncheapDescription(html, nodes, eventNode, title),
    source_url: sourceUrl,
  };
}

function funcheapHtmlToLines(html: string): string[] {
  return html
    .replace(/<\/(?:p|div|li|h1|h2|h3|h4|h5|h6|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map((line) => normalizeWhitespace(stripHtml(line)))
    .filter(Boolean);
}

function extractFuncheapDescription(lines: string[]): string | null {
  const detailsIndex = lines.findIndex((line) => /^Event Details$/i.test(line));
  if (detailsIndex === -1) {
    return null;
  }

  for (let index = detailsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      /^Original Event Description:?$/i.test(line) ||
      /^Text extracted from provided image:?$/i.test(line) ||
      /^Cost:/i.test(line) ||
      /^Categories:/i.test(line) ||
      /^Venue:/i.test(line) ||
      /^Address:/i.test(line)
    ) {
      break;
    }
    if (line.length < 40) {
      continue;
    }
    if (
      /\.entry|fc-img-auto-add|width:|height:|margin:|{.*}|^\.[a-z]/i.test(line)
    ) {
      continue;
    }
    if (
      /^\d{1,5}\s+.+,\s*San Francisco(?:,\s*CA)?/i.test(line) ||
      /^[A-Z][\w'.& -]+,\s+\d{1,5}\s+/i.test(line) ||
      /^\s*(?:San Francisco SPCA|Yerba Buena Gardens|Golden Gate National Recreation Area|KQED Headquarters)\b/i.test(
        line,
      )
    ) {
      continue;
    }
    if (
      !/[.!?]/.test(line) &&
      !/\b(?:bring|celebrate|come|discover|enjoy|featuring|join|learn|live|party|show|festival|event|workshop|comedy|music)\b/i.test(
        line,
      )
    ) {
      continue;
    }
    return line;
  }

  return null;
}

function normalizeFuncheapTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(value)
    .replace(/\s+to\s+/gi, " – ")
    .replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase());
  return normalized || null;
}

function isNonSanFranciscoFuncheapEvent(
  title: string,
  address: string | null,
): boolean {
  const normalizedTitle = title.toLowerCase();
  const normalizedAddress = (address ?? "").toLowerCase();
  const sanFranciscoRe = /\bsan francisco\b|(?:^|\W)sf\b/;
  const nonSanFranciscoPlaceRe =
    /\b(?:alameda|albany|berkeley|dublin|marin|oakland|petaluma|san bruno|san jose|walnut creek|woodside)\b/;

  if (/\bsan francisco bay area\b/.test(normalizedAddress)) {
    return true;
  }

  if (/\|\s*bay area\b/.test(normalizedTitle)) {
    return true;
  }

  if (/\bbay area\b/.test(normalizedAddress) && !sanFranciscoRe.test(normalizedAddress)) {
    return true;
  }

  if (nonSanFranciscoPlaceRe.test(normalizedAddress) && !sanFranciscoRe.test(normalizedAddress)) {
    return true;
  }

  if (!normalizedAddress && nonSanFranciscoPlaceRe.test(normalizedTitle)) {
    return true;
  }

  return false;
}

export function parseFuncheapEventPage(
  html: string,
  sourceUrl: string,
): NewEvent | null {
  const jsonLdEvent = parseFuncheapJsonLdEvent(html, sourceUrl);
  if (jsonLdEvent) {
    return jsonLdEvent;
  }

  const lines = funcheapHtmlToLines(html);
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = normalizeEscapedHtmlText(
    titleMatch ? stripHtml(titleMatch[1]) : lines.find((line) => line.length > 8) ?? "",
  );
  if (!title) {
    return null;
  }

  const dateTimeLine = lines.find((line) =>
    new RegExp(`(?:${WEEKDAY_PATTERN}),\\s+(?:${MONTH_NAME_PATTERN})\\s+\\d{1,2},\\s+\\d{4}`, "i").test(line),
  );
  const dateMatch = dateTimeLine?.match(
    new RegExp(`((?:${MONTH_NAME_PATTERN})\\s+\\d{1,2},\\s+\\d{4})`, "i"),
  );
  if (!dateMatch) {
    return null;
  }
  const timeMatch = dateTimeLine?.match(
    /\d{1,2}:\d{2}\s*[ap]m(?:\s*to\s*\d{1,2}:\d{2}\s*[ap]m)?/i,
  );
  const venueIndex = lines.findIndex((line) => /^Venue:$/i.test(line));
  const addressIndex = lines.findIndex((line) => /^Address:$/i.test(line));
  const venue = venueIndex === -1 ? null : lines[venueIndex + 1] ?? null;
  const address = addressIndex === -1 ? null : lines[addressIndex + 1] ?? null;
  if (isNonSanFranciscoFuncheapEvent(title, address)) {
    return null;
  }

  const description = extractFuncheapDescription(lines);
  const location = normalizeWhitespace(
    [venue, address?.replace(/,\s*CA(?:\s+\d{5})?$/i, "")]
      .filter(Boolean)
      .join(", "),
  ) || "San Francisco";
  const normalized = normalizeFuncheapTitleAndDate(
    title,
    normalizeDateText(dateMatch[0]),
  );

  return {
    title: normalizeEscapedHtmlText(normalized.title),
    location,
    date: normalized.date,
    time: normalizeFuncheapTime(timeMatch?.[0] ?? null),
    description: description ? normalizeEscapedHtmlText(description) : null,
    source_url: sourceUrl,
  };
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

function eventIdentityKey(event: Pick<NewEvent, "title" | "location" | "date">): string {
  const normalizedDate = normalizeDateText(event.date);
  return buildEventIdentityKey({
    title: event.title,
    location: event.location,
    dateText: normalizedDate,
  });
}

export function extractEvents(text: string, existing: string[]): NewEvent[] {
  const results: NewEvent[] = [];
  const seenKeys = new Set(existing);
  const pattern = new RegExp(
    `([A-Z][A-Za-z &:'’\\-]{4,60}?)\\s+(?:on\\s+|[–-]\\s*)?((?:${MONTH_NAME_PATTERN})\\s+\\d{1,2}(?!\\d)(?:,?\\s+\\d{4})?)`,
    "g",
  );
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const title = normalizeEscapedHtmlText(normalizeExtractedEventTitle(match[1]));
    const date = match[2].trim();
    if (!isLikelyFallbackEventTitle(title)) continue;
    const event = {
      title,
      location: "Mission District, San Francisco",
      date,
      time: null,
      description: null,
      source_url: null,
    };
    const key = eventIdentityKey(event);
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    results.push(event);
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
  const seenKeys = new Set(existing);
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

    const event = {
      title: normalizeEscapedHtmlText(heading.title),
      location: options.location,
      date,
      time: null,
      description: null,
      source_url: options.sourceUrl,
    };
    const key = eventIdentityKey(event);
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);

    results.push(event);
  }

  return results;
}

export async function fetchFuncheap(existing: string[]): Promise<NewEvent[]> {
  const items = await fetchRss("https://sf.funcheap.com/feed/");
  const results: NewEvent[] = [];
  const seenKeys = new Set(existing);

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

    let event: NewEvent | null = null;
    if (item.link) {
      const pageHtml = await fetchPageHtml(item.link);
      if (pageHtml.includes("<h1")) {
        event = parseFuncheapEventPage(pageHtml, item.link);
      }
    }

    const fallbackTitle = normalizeEscapedHtmlText(
      title.replace(/\s*-\s*FREE\s*$/i, "").trim(),
    );
    const fallbackDescription = stripFuncheapAttribution(item.description || "");
    const fallbackEvent = {
      title: fallbackTitle,
      location: "San Francisco",
      date: normalizeDateText(date),
      time: null,
      description: fallbackDescription
        ? normalizeEscapedHtmlText(fallbackDescription)
        : null,
      source_url: item.link || null,
    };

    const candidate = event ?? fallbackEvent;
    if (candidate.title.length >= 3) {
      const key = eventIdentityKey(candidate);
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      results.push(candidate);
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
