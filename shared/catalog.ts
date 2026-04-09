import type {
  DietaryFlagKey,
  DietaryFlags,
  PushPreferences,
  Restaurant,
  SFEvent,
} from "./types.ts";

export const DIETARY_FLAG_DEFINITIONS: Array<{
  key: DietaryFlagKey;
  symbol: string;
  label: string;
  color: string;
}> = [
  { key: "gluten_free", symbol: "GF", label: "Gluten-free", color: "#d4a017" },
  { key: "vegan", symbol: "VG", label: "Vegan", color: "#4caf50" },
  { key: "vegetarian", symbol: "V", label: "Vegetarian", color: "#66bb6a" },
];

export const EVENT_CATEGORY_LABELS = {
  art: "Art",
  community: "Community",
  festival: "Festival",
  film: "Film",
  market: "Market",
  music: "Music",
} as const;

export type EventCategory = keyof typeof EVENT_CATEGORY_LABELS;

const NEIGHBORHOOD_ALIASES: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "Mission", patterns: [/\bmission\b/i, /dolores park/i, /mission st/i] },
  { label: "SoMa", patterns: [/\bsoma\b/i, /south of market/i] },
  { label: "Potrero Hill", patterns: [/potrero hill/i, /vermont & 20th/i] },
  { label: "Golden Gate Park", patterns: [/golden gate park/i, /hippie hill/i] },
  { label: "Financial District", patterns: [/financial district/i, /main to great highway/i] },
  { label: "Civic Center", patterns: [/civic center/i, /main public library/i] },
  { label: "Marina", patterns: [/marina/i, /fort mason/i] },
  { label: "Yerba Buena", patterns: [/yerba buena/i] },
  { label: "Haight", patterns: [/\bhaight\b/i] },
  { label: "Sunset", patterns: [/sunset/i] },
  { label: "Richmond", patterns: [/richmond/i] },
  { label: "Castro", patterns: [/castro/i] },
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values))
    .filter((value) => value.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

export function normalizePushPreferences(
  preferences?: Partial<PushPreferences> | null,
): PushPreferences {
  return {
    neighborhoods: uniqueSorted((preferences?.neighborhoods ?? []).map((value) => value.trim())),
    cuisines: uniqueSorted((preferences?.cuisines ?? []).map((value) => value.trim())),
    dietary_flags: uniqueSorted(
      (preferences?.dietary_flags ?? []).map((value) => String(value).trim()),
    ).filter((value): value is DietaryFlagKey =>
      DIETARY_FLAG_DEFINITIONS.some((definition) => definition.key === value),
    ),
    event_categories: uniqueSorted(
      (preferences?.event_categories ?? []).map((value) => String(value).trim()),
    ).filter((value): value is EventCategory => value in EVENT_CATEGORY_LABELS),
  };
}

export function hasPushPreferences(preferences: PushPreferences): boolean {
  return (
    preferences.neighborhoods.length > 0 ||
    preferences.cuisines.length > 0 ||
    preferences.dietary_flags.length > 0 ||
    preferences.event_categories.length > 0
  );
}

export function formatEventCategory(category: EventCategory): string {
  return EVENT_CATEGORY_LABELS[category];
}

export function deriveEventCategory(event: Pick<SFEvent, "title" | "location" | "description">): EventCategory {
  const haystack = `${event.title} ${event.location} ${event.description ?? ""}`.toLowerCase();

  if (/(night market|market\b|vendor|craft fair)/i.test(haystack)) {
    return "market";
  }

  if (/(film|screening|roxie|cinema|theater|theatre|4k)/i.test(haystack)) {
    return "film";
  }

  if (/(concert|live music|music hall|goldenvoice|popscene|dj\b|album release|band\b|tour\b)/i.test(haystack)) {
    return "music";
  }

  if (/(festival|parade|carnaval|celebration|fair\b|holiday)/i.test(haystack)) {
    return "festival";
  }

  if (/(art\b|poetry|gallery|performance project|installation)/i.test(haystack)) {
    return "art";
  }

  return "community";
}

export function deriveEventNeighborhood(event: Pick<SFEvent, "location">): string {
  for (const candidate of NEIGHBORHOOD_ALIASES) {
    if (candidate.patterns.some((pattern) => pattern.test(event.location))) {
      return candidate.label;
    }
  }

  return "Other SF";
}

export function getRestaurantNeighborhoodOptions(restaurants: Restaurant[]): string[] {
  return uniqueSorted(restaurants.map((restaurant) => restaurant.neighborhood));
}

export function getRestaurantCuisineOptions(restaurants: Restaurant[]): string[] {
  return uniqueSorted(restaurants.map((restaurant) => restaurant.cuisine));
}

export function getEventNeighborhoodOptions(events: SFEvent[]): string[] {
  return uniqueSorted(events.map((event) => deriveEventNeighborhood(event)));
}

export function getEventCategoryOptions(events: SFEvent[]): EventCategory[] {
  return uniqueSorted(events.map((event) => deriveEventCategory(event))).filter(
    (value): value is EventCategory => value in EVENT_CATEGORY_LABELS,
  );
}

export function hasDietaryFlag(
  dietaryFlags: DietaryFlags | null,
  flag: DietaryFlagKey,
): boolean {
  return Boolean(dietaryFlags?.[flag]?.available);
}

export function matchesPreferredNeighborhood(
  neighborhood: string,
  preferences: PushPreferences,
): boolean {
  if (preferences.neighborhoods.length === 0) {
    return true;
  }

  const normalized = normalizeText(neighborhood);
  return preferences.neighborhoods.some((value) => normalizeText(value) === normalized);
}

export function matchesPreferredCuisine(
  cuisine: string,
  preferences: PushPreferences,
): boolean {
  if (preferences.cuisines.length === 0) {
    return true;
  }

  const normalized = normalizeText(cuisine);
  return preferences.cuisines.some((value) => normalizeText(value) === normalized);
}

export function matchesPreferredDietaryFlags(
  dietaryFlags: DietaryFlags | null,
  preferences: PushPreferences,
): boolean {
  if (preferences.dietary_flags.length === 0) {
    return true;
  }

  return preferences.dietary_flags.some((flag) => hasDietaryFlag(dietaryFlags, flag));
}

export function matchesPreferredEventCategory(
  category: EventCategory,
  preferences: PushPreferences,
): boolean {
  if (preferences.event_categories.length === 0) {
    return true;
  }

  return preferences.event_categories.includes(category);
}

export function restaurantMatchesPushPreferences(
  restaurant: Restaurant,
  preferences: PushPreferences,
): boolean {
  return (
    matchesPreferredNeighborhood(restaurant.neighborhood, preferences) &&
    matchesPreferredCuisine(restaurant.cuisine, preferences) &&
    matchesPreferredDietaryFlags(restaurant.dietary_flags, preferences)
  );
}

export function eventMatchesPushPreferences(
  event: SFEvent,
  preferences: PushPreferences,
): boolean {
  return (
    matchesPreferredNeighborhood(deriveEventNeighborhood(event), preferences) &&
    matchesPreferredEventCategory(deriveEventCategory(event), preferences)
  );
}
