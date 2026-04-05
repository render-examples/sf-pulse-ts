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

/**
 * Returns true when the date string explicitly marks the item as upcoming/future.
 * Used to ensure upcoming items always sort after the TODAY marker regardless
 * of the fuzzy parsed date.
 */
export function isUpcoming(raw: string): boolean {
  return /upcoming|tbd|tba|coming soon/i.test(raw);
}

export function parseDate(raw: string): Date | null {
  const s = raw.toLowerCase().trim();

  // Extract year
  const yearMatch = s.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);

  // Season override
  for (const [season, month] of Object.entries(SEASON_MONTH)) {
    if (s.includes(season)) {
      return new Date(Date.UTC(year, month, 1));
    }
  }

  // Find month name
  let month: number | null = null;
  for (const [name, idx] of Object.entries(MONTH_INDEX)) {
    if (s.includes(name)) {
      month = idx;
      break;
    }
  }
  if (month === null) return new Date(Date.UTC(year, 0, 1));

  // Find day — "March 3, 2026" / "May 23–24, 2026" → take first 1-2 digit number
  // after the month name that is NOT part of the year (exclude 4-digit numbers).
  const dayMatch = s.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?!\d)/);
  const day = dayMatch ? parseInt(dayMatch[1], 10) : 1;

  return new Date(Date.UTC(year, month, day));
}

/**
 * Today at midnight UTC, for stable comparison.
 */
export function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Format a parsed Date for display as a divider label.
 * e.g. "April 2026", "March 2026"
 */
export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
