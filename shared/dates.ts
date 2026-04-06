const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_INDEX: Record<string, number> = Object.fromEntries(
  MONTH_NAMES.map((name, index) => [name.toLowerCase(), index]),
) as Record<string, number>;

const SEASON_START_MONTH: Record<string, number> = {
  spring: 3,
  summer: 6,
  fall: 9,
  autumn: 9,
  winter: 0,
};

const MONTH_PATTERN = MONTH_NAMES.join("|");
const SEASON_PATTERN = "spring|summer|fall|autumn|winter";

type DateRange = {
  start: Date;
  end: Date;
};

export type DatePrecision =
  | "day"
  | "day_range"
  | "month"
  | "season"
  | "year"
  | "unknown";

export interface StructuredDate {
  startDate: string | null;
  endDate: string | null;
  datePrecision: DatePrecision;
  isUpcoming: boolean;
}

export function todayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function endOfMonthUTC(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0));
}

function inferYear(month: number, reference: Date): number {
  const referenceYear = reference.getUTCFullYear();
  return month < reference.getUTCMonth() ? referenceYear + 1 : referenceYear;
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

function normalizeRawDate(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .replace(/\s*([–-])\s*/g, "$1")
    .replace(/\s+,/g, ",")
    .trim();
}

function formatIsoDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function findMonth(raw: string): number | null {
  const lower = raw.toLowerCase();
  for (const [name, index] of Object.entries(MONTH_INDEX)) {
    if (lower.includes(name)) return index;
  }
  return null;
}

export function hasExplicitYear(raw: string): boolean {
  return /\b20\d{2}\b/.test(raw);
}

export function normalizeDateText(
  raw: string,
  reference = todayUTC(),
): string {
  const normalized = normalizeRawDate(raw);
  if (!normalized) return normalized;
  if (hasExplicitYear(normalized)) return normalized;

  const month = findMonth(normalized);
  if (month !== null) {
    const inferredYear = inferYear(month, reference);
    const rangeMatch = normalized.match(
      new RegExp(
        `(?:${MONTH_PATTERN})\\s+(\\d{1,2})(?!\\d)(?:[–-](\\d{1,2})(?!\\d))?`,
        "i",
      ),
    );
    if (rangeMatch) {
      const monthName = MONTH_NAMES[month];
      const startDay = rangeMatch[1];
      const endDay = rangeMatch[2];
      return `${monthName} ${startDay}${endDay ? `–${endDay}` : ""}, ${inferredYear}`;
    }

    return `${MONTH_NAMES[month]} ${inferredYear}`;
  }

  const seasonMatch = normalized.match(new RegExp(`\\b(${SEASON_PATTERN})\\b`, "i"));
  if (seasonMatch) {
    const season = seasonMatch[1];
    const monthIndex = SEASON_START_MONTH[season.toLowerCase()];
    return `${season[0].toUpperCase()}${season.slice(1).toLowerCase()} ${inferYear(monthIndex, reference)}`;
  }

  return normalized;
}

export function getDatePrecision(raw: string): DatePrecision {
  const normalized = normalizeRawDate(raw);
  if (!normalized) return "unknown";

  if (new RegExp(`\\b(${SEASON_PATTERN})\\b`, "i").test(normalized)) {
    return "season";
  }

  const dayRangeMatch = normalized.match(
    new RegExp(
      `(?:${MONTH_PATTERN})\\s+\\d{1,2}(?!\\d)(?:[–-](\\d{1,2})(?!\\d))?`,
      "i",
    ),
  );
  if (dayRangeMatch) {
    return dayRangeMatch[1] ? "day_range" : "day";
  }

  if (findMonth(normalized) !== null) {
    return "month";
  }

  if (hasExplicitYear(normalized)) {
    return "year";
  }

  return "unknown";
}

function parseDateRange(
  raw: string,
  reference = todayUTC(),
): DateRange | null {
  const normalized = normalizeDateText(raw, reference);
  const lower = normalized.toLowerCase();
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;
  const year = Number.parseInt(yearMatch[1], 10);

  if (lower.includes("spring")) {
    return {
      start: new Date(Date.UTC(year, 3, 1)),
      end: endOfMonthUTC(year, 5),
    };
  }
  if (lower.includes("summer")) {
    return {
      start: new Date(Date.UTC(year, 6, 1)),
      end: endOfMonthUTC(year, 8),
    };
  }
  if (lower.includes("fall") || lower.includes("autumn")) {
    return {
      start: new Date(Date.UTC(year, 9, 1)),
      end: endOfMonthUTC(year, 11),
    };
  }
  if (lower.includes("winter")) {
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: endOfMonthUTC(year, 1),
    };
  }

  const month = findMonth(lower);
  if (month === null) {
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year, 11, 31)),
    };
  }

  const dayRangeMatch = lower.match(
    new RegExp(
      `(?:${MONTH_PATTERN})\\s+(\\d{1,2})(?!\\d)(?:[–-](\\d{1,2})(?!\\d))?`,
      "i",
    ),
  );
  if (dayRangeMatch) {
    const startDay = Number.parseInt(dayRangeMatch[1], 10);
    const endDay = Number.parseInt(dayRangeMatch[2] ?? dayRangeMatch[1], 10);
    return {
      start: new Date(Date.UTC(year, month, startDay)),
      end: new Date(Date.UTC(year, month, endDay)),
    };
  }

  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: endOfMonthUTC(year, month),
  };
}

export function parseDate(raw: string, reference = todayUTC()): Date | null {
  return parseDateRange(raw, reference)?.start ?? null;
}

export function deriveStructuredDate(
  raw: string,
  reference = todayUTC(),
): StructuredDate {
  const range = parseDateRange(raw, reference);

  return {
    startDate: range ? formatIsoDateUTC(range.start) : null,
    endDate: range ? formatIsoDateUTC(range.end) : null,
    datePrecision: getDatePrecision(raw),
    isUpcoming: isTodayOrPotentialFuture(raw, reference),
  };
}

export function isUpcoming(raw: string): boolean {
  return /upcoming|tbd|tba|coming soon/i.test(raw);
}

export function isTodayOrPotentialFuture(
  raw: string,
  reference = todayUTC(),
): boolean {
  if (isUpcoming(raw)) return true;

  const range = parseDateRange(raw, reference);
  if (!range) return true;

  return range.end.getTime() >= reference.getTime();
}

export function compareDateText(
  a: string,
  b: string,
  reference = todayUTC(),
): number {
  const aMs = parseDate(a, reference)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bMs = parseDate(b, reference)?.getTime() ?? Number.POSITIVE_INFINITY;

  if (aMs !== bMs) return aMs - bMs;

  return normalizeDateText(a, reference).localeCompare(normalizeDateText(b, reference));
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
