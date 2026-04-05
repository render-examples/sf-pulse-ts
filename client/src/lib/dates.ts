/**
 * Best-effort date parser for the free-form date strings stored in the DB.
 *
 * Examples it handles:
 *   "March 2026"                → Mar 1 2026
 *   "March 3, 2026"             → Mar 3 2026
 *   "February 16, 2026"         → Feb 16 2026
 *   "August 2025"               → Aug 1 2025
 *   "Spring 2026 (upcoming)"    → Apr 1 2026 (mid-spring)
 *   "May 23–24, 2026"           → May 23 2026 (first day of range)
 *   "April 1, 2026"             → Apr 1 2026
 *
 * Returns a Date set to midnight UTC for that approximate day.
 * Returns `null` only if no year is present at all.
 */

const SEASON_MONTH: Record<string, number> = {
  spring: 3, // April — mid-spring
  summer: 6, // July — mid-summer
  fall:   9, // October
  autumn: 9,
  winter: 0, // January
};

const MONTH_INDEX: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

type DateRange = {
  start: Date;
  end: Date;
};

const MONTH_PATTERN =
  "january|february|march|april|may|june|july|august|september|october|november|december";

function endOfMonthUTC(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0));
}

function parseDateRange(raw: string): DateRange | null {
  const s = raw.toLowerCase().trim();

  const yearMatch = s.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);

  if (s.includes("spring")) {
    return {
      start: new Date(Date.UTC(year, 2, 1)),
      end: endOfMonthUTC(year, 4),
    };
  }
  if (s.includes("summer")) {
    return {
      start: new Date(Date.UTC(year, 5, 1)),
      end: endOfMonthUTC(year, 7),
    };
  }
  if (s.includes("fall") || s.includes("autumn")) {
    return {
      start: new Date(Date.UTC(year, 8, 1)),
      end: endOfMonthUTC(year, 10),
    };
  }
  if (s.includes("winter")) {
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: endOfMonthUTC(year, 1),
    };
  }

  let month: number | null = null;
  for (const [name, idx] of Object.entries(MONTH_INDEX)) {
    if (s.includes(name)) {
      month = idx;
      break;
    }
  }

  if (month === null) {
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year, 11, 31)),
    };
  }

  const dayRangeMatch = s.match(
    new RegExp(`(?:${MONTH_PATTERN})\\s+(\\d{1,2})(?:\\s*[–-]\\s*(\\d{1,2}))?`, "i"),
  );
  if (dayRangeMatch) {
    const startDay = parseInt(dayRangeMatch[1], 10);
    const endDay = parseInt(dayRangeMatch[2] ?? dayRangeMatch[1], 10);
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

/**
 * Returns true when the date string explicitly marks the item as upcoming/future.
 * Used to ensure upcoming items always sort after the TODAY marker regardless
 * of the fuzzy parsed date.
 */
export function isUpcoming(raw: string): boolean {
  return /upcoming|tbd|tba|coming soon/i.test(raw);
}

export function parseDate(raw: string): Date | null {
  return parseDateRange(raw)?.start ?? null;
}

/**
 * Today at midnight UTC, for stable comparison.
 */
export function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Returns true when the date string is today or could still land in the future.
 * Month-only and season-only values stay below the TODAY divider until their
 * full possible range has elapsed.
 */
export function isTodayOrPotentialFuture(
  raw: string,
  reference = todayUTC(),
): boolean {
  if (isUpcoming(raw)) return true;

  const range = parseDateRange(raw);
  if (!range) return true;

  return range.end.getTime() >= reference.getTime();
}

/**
 * Format a parsed Date for display as a divider label.
 * e.g. "April 2026", "March 2026"
 */
export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
