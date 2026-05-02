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

export interface NeighborhoodCenter {
  lat: number;
  lng: number;
}

export interface NeighborhoodAlias {
  label: string;
  center: NeighborhoodCenter;
  patterns: RegExp[];
}

export const NEIGHBORHOOD_ALIASES: NeighborhoodAlias[] = [
  { label: "Mission", center: { lat: 37.7599, lng: -122.4148 }, patterns: [/\bmission\b/i, /dolores park/i, /mission st/i] },
  { label: "SoMa", center: { lat: 37.7785, lng: -122.3950 }, patterns: [/\bsoma\b/i, /south of market/i] },
  { label: "Potrero Hill", center: { lat: 37.7605, lng: -122.3926 }, patterns: [/potrero hill/i, /vermont & 20th/i] },
  { label: "Golden Gate Park", center: { lat: 37.7694, lng: -122.4862 }, patterns: [/golden gate park/i, /hippie hill/i] },
  { label: "Financial District", center: { lat: 37.7946, lng: -122.3999 }, patterns: [/financial district/i, /main to great highway/i] },
  { label: "Civic Center", center: { lat: 37.7793, lng: -122.4158 }, patterns: [/civic center/i, /main public library/i] },
  { label: "Marina", center: { lat: 37.8015, lng: -122.4368 }, patterns: [/marina/i, /fort mason/i] },
  { label: "Yerba Buena", center: { lat: 37.7854, lng: -122.4005 }, patterns: [/yerba buena/i] },
  { label: "Haight", center: { lat: 37.7692, lng: -122.4481 }, patterns: [/\bhaight\b/i] },
  { label: "Sunset", center: { lat: 37.7533, lng: -122.4946 }, patterns: [/sunset/i] },
  { label: "Richmond", center: { lat: 37.7800, lng: -122.4784 }, patterns: [/richmond/i] },
  { label: "Castro", center: { lat: 37.7609, lng: -122.4350 }, patterns: [/castro/i] },
];

export const OTHER_SF_NEIGHBORHOOD: NeighborhoodAlias = {
  label: 'Other SF',
  center: { lat: 37.7749, lng: -122.4194 },
  patterns: [],
};

export const ALL_NEIGHBORHOODS: NeighborhoodAlias[] = [
  ...NEIGHBORHOOD_ALIASES,
  OTHER_SF_NEIGHBORHOOD,
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

export function findNearestNeighborhood(lat: number, lng: number): NeighborhoodAlias {
  let best = ALL_NEIGHBORHOODS[0];
  let bestDist = Infinity;
  for (const entry of ALL_NEIGHBORHOODS) {
    const dLat = lat - entry.center.lat;
    const dLng = lng - entry.center.lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best;
}

export interface NeighborhoodGroup {
  restaurants: Restaurant[];
  events: SFEvent[];
}

export function groupByNeighborhood(
  restaurants: Restaurant[],
  events: SFEvent[],
): Map<string, NeighborhoodGroup> {
  const groups = new Map<string, NeighborhoodGroup>();
  for (const entry of ALL_NEIGHBORHOODS) {
    groups.set(entry.label, { restaurants: [], events: [] });
  }
  for (const restaurant of restaurants) {
    const key = groups.has(restaurant.neighborhood) ? restaurant.neighborhood : 'Other SF';
    groups.get(key)!.restaurants.push(restaurant);
  }
  for (const event of events) {
    const neighborhood = deriveEventNeighborhood(event);
    groups.get(neighborhood)!.events.push(event);
  }
  return groups;
}
