import { todayUTC } from "./dates.ts";
import {
  deriveEventCategory,
  deriveEventNeighborhood,
  hasDietaryFlag,
} from "./catalog.ts";
import type {
  DietaryFlagKey,
  Restaurant,
  SFEvent,
} from "./types.ts";

export interface RestaurantFilters {
  query: string;
  neighborhoods: string[];
  cuisines: string[];
  dietaryFlags: DietaryFlagKey[];
  upcomingOnly: boolean;
  fromDate: string;
  toDate: string;
}

export interface EventFilters {
  query: string;
  neighborhoods: string[];
  categories: string[];
  upcomingOnly: boolean;
  fromDate: string;
  toDate: string;
}

export interface HomeFilters {
  restaurants: RestaurantFilters;
  events: EventFilters;
}

export const DEFAULT_RESTAURANT_FILTERS: RestaurantFilters = {
  query: "",
  neighborhoods: [],
  cuisines: [],
  dietaryFlags: [],
  upcomingOnly: false,
  fromDate: "",
  toDate: "",
};

export const DEFAULT_EVENT_FILTERS: EventFilters = {
  query: "",
  neighborhoods: [],
  categories: [],
  upcomingOnly: false,
  fromDate: "",
  toDate: "",
};

export const DEFAULT_HOME_FILTERS: HomeFilters = {
  restaurants: DEFAULT_RESTAURANT_FILTERS,
  events: DEFAULT_EVENT_FILTERS,
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function parseList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return unique(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function normalizeIsoDate(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function parseHomeFilters(searchParams: URLSearchParams): HomeFilters {
  return {
    restaurants: {
      query: searchParams.get("r-q")?.trim() ?? "",
      neighborhoods: parseList(searchParams.get("r-neighborhood")),
      cuisines: parseList(searchParams.get("r-cuisine")),
      dietaryFlags: parseList(searchParams.get("r-diet")).filter(
        (value): value is DietaryFlagKey =>
          value === "gluten_free" || value === "vegan" || value === "vegetarian",
      ),
      upcomingOnly: searchParams.get("r-upcoming") === "1",
      fromDate: normalizeIsoDate(searchParams.get("r-from")),
      toDate: normalizeIsoDate(searchParams.get("r-to")),
    },
    events: {
      query: searchParams.get("e-q")?.trim() ?? "",
      neighborhoods: parseList(searchParams.get("e-neighborhood")),
      categories: parseList(searchParams.get("e-category")),
      upcomingOnly: searchParams.get("e-upcoming") === "1",
      fromDate: normalizeIsoDate(searchParams.get("e-from")),
      toDate: normalizeIsoDate(searchParams.get("e-to")),
    },
  };
}

export function serializeHomeFilters(filters: HomeFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.restaurants.query) params.set("r-q", filters.restaurants.query);
  if (filters.restaurants.neighborhoods.length) {
    params.set("r-neighborhood", filters.restaurants.neighborhoods.join(","));
  }
  if (filters.restaurants.cuisines.length) {
    params.set("r-cuisine", filters.restaurants.cuisines.join(","));
  }
  if (filters.restaurants.dietaryFlags.length) {
    params.set("r-diet", filters.restaurants.dietaryFlags.join(","));
  }
  if (filters.restaurants.upcomingOnly) params.set("r-upcoming", "1");
  if (filters.restaurants.fromDate) params.set("r-from", filters.restaurants.fromDate);
  if (filters.restaurants.toDate) params.set("r-to", filters.restaurants.toDate);

  if (filters.events.query) params.set("e-q", filters.events.query);
  if (filters.events.neighborhoods.length) {
    params.set("e-neighborhood", filters.events.neighborhoods.join(","));
  }
  if (filters.events.categories.length) {
    params.set("e-category", filters.events.categories.join(","));
  }
  if (filters.events.upcomingOnly) params.set("e-upcoming", "1");
  if (filters.events.fromDate) params.set("e-from", filters.events.fromDate);
  if (filters.events.toDate) params.set("e-to", filters.events.toDate);

  return params;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matchesQuery(
  query: string,
  haystacks: Array<string | null | undefined>,
): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = normalize(query);
  return haystacks.some((value) => normalize(value ?? "").includes(normalizedQuery));
}

function matchesMultiSelect(selected: string[], value: string): boolean {
  if (selected.length === 0) {
    return true;
  }

  const normalizedValue = normalize(value);
  return selected.some((entry) => normalize(entry) === normalizedValue);
}

function dateRangeOverlaps(
  startDate: string | null,
  endDate: string | null,
  fromDate: string,
  toDate: string,
): boolean {
  if (!fromDate && !toDate) {
    return true;
  }

  if (!startDate || !endDate) {
    return false;
  }

  const itemStart = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const itemEnd = new Date(`${endDate}T23:59:59.999Z`).getTime();
  const filterStart = fromDate
    ? new Date(`${fromDate}T00:00:00.000Z`).getTime()
    : Number.NEGATIVE_INFINITY;
  const filterEnd = toDate
    ? new Date(`${toDate}T23:59:59.999Z`).getTime()
    : Number.POSITIVE_INFINITY;

  return itemStart <= filterEnd && itemEnd >= filterStart;
}

function upcomingBoundary(): number {
  return todayUTC().getTime();
}

function matchesUpcomingOnly(
  isUpcoming: boolean,
  startDate: string | null,
  endDate: string | null,
  upcomingOnly: boolean,
): boolean {
  if (!upcomingOnly) {
    return true;
  }

  if (isUpcoming) {
    return true;
  }

  if (!startDate || !endDate) {
    return false;
  }

  return new Date(`${endDate}T23:59:59.999Z`).getTime() >= upcomingBoundary();
}

export function applyRestaurantFilters(
  restaurants: Restaurant[],
  filters: RestaurantFilters,
): Restaurant[] {
  return restaurants.filter((restaurant) => {
    if (
      !matchesQuery(filters.query, [
        restaurant.name,
        restaurant.neighborhood,
        restaurant.cuisine,
        restaurant.address,
      ])
    ) {
      return false;
    }

    if (!matchesMultiSelect(filters.neighborhoods, restaurant.neighborhood)) {
      return false;
    }

    if (!matchesMultiSelect(filters.cuisines, restaurant.cuisine)) {
      return false;
    }

    if (
      filters.dietaryFlags.length > 0 &&
      !filters.dietaryFlags.some((flag) => hasDietaryFlag(restaurant.dietary_flags, flag))
    ) {
      return false;
    }

    if (
      !matchesUpcomingOnly(
        restaurant.is_upcoming,
        restaurant.opened_start_date,
        restaurant.opened_end_date,
        filters.upcomingOnly,
      )
    ) {
      return false;
    }

    return dateRangeOverlaps(
      restaurant.opened_start_date,
      restaurant.opened_end_date,
      filters.fromDate,
      filters.toDate,
    );
  });
}

export function applyEventFilters(events: SFEvent[], filters: EventFilters): SFEvent[] {
  return events.filter((event) => {
    if (
      !matchesQuery(filters.query, [
        event.title,
        event.location,
        event.description,
        deriveEventCategory(event),
      ])
    ) {
      return false;
    }

    if (!matchesMultiSelect(filters.neighborhoods, deriveEventNeighborhood(event))) {
      return false;
    }

    if (!matchesMultiSelect(filters.categories, deriveEventCategory(event))) {
      return false;
    }

    if (
      !matchesUpcomingOnly(
        event.is_upcoming,
        event.start_date,
        event.end_date,
        filters.upcomingOnly,
      )
    ) {
      return false;
    }

    return dateRangeOverlaps(event.start_date, event.end_date, filters.fromDate, filters.toDate);
  });
}
