import type { Pool } from "pg";
import { pool as defaultPool, query, queryOne, execute } from "./db.js";
import {
  compareDateText,
  deriveStructuredDate,
  normalizeDateText,
  todayUTC,
  type DatePrecision,
} from "../shared/dates.ts";
import { buildEventIdentityKey } from "../shared/event-identity.ts";
import { buildRestaurantIdentityKey } from "../shared/restaurant-identity.ts";

export interface DietaryFlag {
  available: boolean;
  confidence: "confirmed" | "inferred";
}

export interface DietaryFlags {
  gluten_free: DietaryFlag;
  vegan: DietaryFlag;
  vegetarian: DietaryFlag;
}

export interface Restaurant {
  id: number;
  name: string;
  neighborhood: string;
  cuisine: string;
  address: string | null;
  opened_date: string;
  opened_start_date: string | null;
  opened_end_date: string | null;
  opened_date_precision: DatePrecision;
  is_upcoming: boolean;
  highlight_kind: "opening" | "michelin";
  source_url: string | null;
  menu_url: string | null;
  menu_checked_at: string | null;
  dietary_flags: DietaryFlags | null;
  added_at: string;
}

export interface Event {
  id: number;
  title: string;
  location: string;
  date: string;
  start_date: string | null;
  end_date: string | null;
  date_precision: DatePrecision;
  is_upcoming: boolean;
  dedupe_key: string;
  time: string | null;
  description: string | null;
  source_url: string | null;
  added_at: string;
}

export interface PushSubscription {
  id: number;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  created_at: string;
}

export interface DataUpdate {
  id: number;
  type: string;
  item_name: string;
  action: string;
  occurred_at: string;
}

export interface CronRun {
  job_name: string;
  last_ran_at: string;
}

// Helper: use injected pool if provided, otherwise use module-level helpers
// that reference the singleton pool from db.ts.
function q<T>(sql: string, params?: unknown[], pool?: Pool): Promise<T[]> {
  return pool
    ? pool.query(sql, params).then((r) => r.rows as T[])
    : query<T>(sql, params);
}

function q1<T>(
  sql: string,
  params?: unknown[],
  pool?: Pool
): Promise<T | undefined> {
  return pool
    ? pool.query(sql, params).then((r) => r.rows[0] as T | undefined)
    : queryOne<T>(sql, params);
}

function exec(sql: string, params?: unknown[], pool?: Pool): Promise<void> {
  return pool
    ? pool.query(sql, params).then(() => undefined)
    : execute(sql, params);
}

function normalizeStoredDateValue(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
}

function normalizeRestaurantDates(restaurant: Restaurant): Restaurant {
  const openedStartDate = normalizeStoredDateValue(restaurant.opened_start_date);
  const openedEndDate = normalizeStoredDateValue(restaurant.opened_end_date);

  if (
    openedStartDate !== null &&
    openedEndDate !== null &&
    restaurant.opened_date_precision !== "unknown"
  ) {
    return {
      ...restaurant,
      opened_start_date: openedStartDate,
      opened_end_date: openedEndDate,
    };
  }

  const structured = deriveStructuredDate(restaurant.opened_date);
  return {
    ...restaurant,
    opened_start_date: openedStartDate ?? structured.startDate,
    opened_end_date: openedEndDate ?? structured.endDate,
    opened_date_precision:
      restaurant.opened_date_precision === "unknown"
        ? structured.datePrecision
        : restaurant.opened_date_precision,
    is_upcoming:
      openedStartDate === null && openedEndDate === null
        ? structured.isUpcoming
        : restaurant.is_upcoming,
  };
}

function normalizeEventDates(event: Event): Event {
  const structured = deriveStructuredDate(event.date);
  const startDate = normalizeStoredDateValue(event.start_date) ?? structured.startDate;
  const endDate = normalizeStoredDateValue(event.end_date) ?? structured.endDate;

  return {
    ...event,
    start_date: startDate,
    end_date: endDate,
    date_precision:
      event.date_precision === "unknown"
        ? structured.datePrecision
        : event.date_precision,
    is_upcoming:
      event.start_date === null && event.end_date === null
        ? structured.isUpcoming
        : event.is_upcoming,
    dedupe_key:
      event.dedupe_key ||
      buildEventIdentityKey({
        title: event.title,
        location: event.location,
        dateText: normalizeDateText(event.date),
      }),
  };
}

function subtractMonthsUTC(reference: Date, months: number): Date {
  return new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth() - months,
      reference.getUTCDate(),
    ),
  );
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isVisibleRestaurant(
  restaurant: Restaurant,
  reference = todayUTC(),
): boolean {
  if (restaurant.highlight_kind === "michelin") {
    return true;
  }

  const normalized = normalizeRestaurantDates(restaurant);
  if (normalized.is_upcoming) {
    return true;
  }

  if (!normalized.opened_start_date) {
    return false;
  }

  return (
    new Date(`${normalized.opened_start_date}T00:00:00.000Z`).getTime() >=
    subtractMonthsUTC(reference, 3).getTime()
  );
}

// ── Restaurants ──────────────────────────────────────────────────────────────

export function getRestaurants(pool?: Pool): Promise<Restaurant[]> {
  return q<Restaurant>("SELECT * FROM restaurants ORDER BY added_at DESC", [], pool).then(
    (rows) => rows.map(normalizeRestaurantDates),
  );
}

export async function getVisibleRestaurants(pool?: Pool): Promise<Restaurant[]> {
  const cutoff = formatIsoDate(subtractMonthsUTC(todayUTC(), 3));
  const restaurants = await q<Restaurant>(
    `SELECT *
     FROM restaurants
     WHERE highlight_kind = 'michelin'
        OR is_upcoming = TRUE
        OR opened_start_date >= $1
        OR opened_start_date IS NULL
     ORDER BY added_at DESC`,
    [cutoff],
    pool,
  );
  return restaurants
    .map(normalizeRestaurantDates)
    .filter((restaurant) => isVisibleRestaurant(restaurant));
}

export type NewRestaurant = Omit<
  Restaurant,
  | "id"
  | "added_at"
  | "menu_url"
  | "menu_checked_at"
  | "dietary_flags"
  | "highlight_kind"
  | "opened_start_date"
  | "opened_end_date"
  | "opened_date_precision"
  | "is_upcoming"
> & {
  highlight_kind?: Restaurant["highlight_kind"];
};

export async function addRestaurant(
  r: NewRestaurant,
  pool?: Pool
): Promise<Restaurant> {
  const structured = deriveStructuredDate(r.opened_date);
  const identityKey = buildRestaurantIdentityKey(r);
  return q1<Restaurant>(
    `INSERT INTO restaurants (
       name,
       neighborhood,
       cuisine,
       address,
       opened_date,
       opened_start_date,
       opened_end_date,
       opened_date_precision,
       is_upcoming,
       source_url,
       highlight_kind,
       identity_key
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (identity_key) DO UPDATE
     SET name = EXCLUDED.name,
         neighborhood = EXCLUDED.neighborhood,
         cuisine = EXCLUDED.cuisine,
         address = EXCLUDED.address,
         opened_date = EXCLUDED.opened_date,
         opened_start_date = EXCLUDED.opened_start_date,
         opened_end_date = EXCLUDED.opened_end_date,
         opened_date_precision = EXCLUDED.opened_date_precision,
         is_upcoming = EXCLUDED.is_upcoming,
         source_url = EXCLUDED.source_url,
         highlight_kind = EXCLUDED.highlight_kind
     RETURNING *`,
    [
      r.name,
      r.neighborhood,
      r.cuisine,
      r.address ?? null,
      r.opened_date,
      structured.startDate,
      structured.endDate,
      structured.datePrecision,
      structured.isUpcoming,
      r.source_url ?? null,
      r.highlight_kind ?? "opening",
      identityKey,
    ],
    pool
  ).then((row) => normalizeRestaurantDates(row as Restaurant)) as Promise<Restaurant>;
}

export function getRestaurantByIdentityKey(
  identityKey: string,
  pool?: Pool,
): Promise<Restaurant | undefined> {
  return q1<Restaurant>(
    "SELECT * FROM restaurants WHERE identity_key = $1 LIMIT 1",
    [identityKey],
    pool,
  ).then((row) => (row ? normalizeRestaurantDates(row as Restaurant) : undefined));
}

export function getRestaurantByName(
  name: string,
  pool?: Pool,
): Promise<Restaurant | undefined> {
  return q1<Restaurant>(
    "SELECT * FROM restaurants WHERE lower(name) = lower($1) LIMIT 1",
    [name],
    pool,
  );
}

export async function updateRestaurant(
  id: number,
  r: NewRestaurant,
  pool?: Pool,
): Promise<Restaurant> {
  const structured = deriveStructuredDate(r.opened_date);
  const identityKey = buildRestaurantIdentityKey(r);
  return q1<Restaurant>(
    `UPDATE restaurants
     SET name = $1,
         neighborhood = $2,
         cuisine = $3,
         address = $4,
         opened_date = $5,
         opened_start_date = $6,
         opened_end_date = $7,
         opened_date_precision = $8,
         is_upcoming = $9,
         source_url = $10,
         highlight_kind = $11,
         identity_key = $12
     WHERE id = $13
     RETURNING *`,
    [
      r.name,
      r.neighborhood,
      r.cuisine,
      r.address ?? null,
      r.opened_date,
      structured.startDate,
      structured.endDate,
      structured.datePrecision,
      structured.isUpcoming,
      r.source_url ?? null,
      r.highlight_kind ?? "opening",
      identityKey,
      id,
    ],
    pool,
  ).then((row) => normalizeRestaurantDates(row as Restaurant)) as Promise<Restaurant>;
}

export async function clearRestaurants(pool?: Pool): Promise<void> {
  await exec("DELETE FROM restaurants", [], pool);
}

export async function deleteRestaurant(id: number, pool?: Pool): Promise<void> {
  await exec("DELETE FROM restaurants WHERE id=$1", [id], pool);
}

// ── Events ───────────────────────────────────────────────────────────────────

export async function getEvents(pool?: Pool): Promise<Event[]> {
  const events = await q<Event>("SELECT * FROM events", [], pool);
  return events.map(normalizeEventDates).sort((a, b) => compareDateText(a.date, b.date));
}

export async function getVisibleEvents(pool?: Pool): Promise<Event[]> {
  return getEvents(pool);
}

export type NewEvent = Omit<
  Event,
  "id" | "added_at" | "start_date" | "end_date" | "date_precision" | "is_upcoming" | "dedupe_key"
>;

export async function addEvent(
  e: NewEvent,
  pool?: Pool
): Promise<Event> {
  const structured = deriveStructuredDate(e.date);
  const normalizedDate = normalizeDateText(e.date);
  const dedupeKey = buildEventIdentityKey({
    title: e.title,
    location: e.location,
    dateText: normalizedDate,
  });
  return q1<Event>(
    `INSERT INTO events (
       title,
       location,
       date,
       start_date,
       end_date,
       date_precision,
       is_upcoming,
       dedupe_key,
       time,
       description,
       source_url
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      e.title,
      e.location,
      e.date,
      structured.startDate,
      structured.endDate,
      structured.datePrecision,
      structured.isUpcoming,
      dedupeKey,
      e.time ?? null,
      e.description ?? null,
      e.source_url ?? null,
    ],
    pool
  ).then((row) => normalizeEventDates(row as Event)) as Promise<Event>;
}

export function getEventByDedupeKey(
  dedupeKey: string,
  pool?: Pool,
): Promise<Event | undefined> {
  return q1<Event>(
    "SELECT * FROM events WHERE dedupe_key = $1 LIMIT 1",
    [dedupeKey],
    pool,
  ).then((row) => (row ? normalizeEventDates(row as Event) : undefined));
}

export async function clearEvents(pool?: Pool): Promise<void> {
  await exec("DELETE FROM events", [], pool);
}

export async function deleteEvent(id: number, pool?: Pool): Promise<void> {
  await exec("DELETE FROM events WHERE id=$1", [id], pool);
}

// ── Push subscriptions ────────────────────────────────────────────────────────

export function getSubscriptions(pool?: Pool): Promise<PushSubscription[]> {
  return q<PushSubscription>("SELECT * FROM push_subscriptions", [], pool);
}

export async function addSubscription(
  endpoint: string,
  keys: { p256dh: string; auth: string },
  pool?: Pool
): Promise<PushSubscription> {
  return q1<PushSubscription>(
    `INSERT INTO push_subscriptions (endpoint, keys)
     VALUES ($1,$2)
     ON CONFLICT (endpoint) DO UPDATE SET keys=EXCLUDED.keys
     RETURNING *`,
    [endpoint, JSON.stringify(keys)],
    pool
  ) as Promise<PushSubscription>;
}

export async function removeSubscription(
  endpoint: string,
  pool?: Pool
): Promise<void> {
  await exec("DELETE FROM push_subscriptions WHERE endpoint=$1", [endpoint], pool);
}

// ── Data updates ──────────────────────────────────────────────────────────────

export function getRecentUpdates(limit = 50, pool?: Pool): Promise<DataUpdate[]> {
  return q<DataUpdate>(
    "SELECT * FROM data_updates ORDER BY occurred_at DESC LIMIT $1",
    [limit],
    pool
  );
}

export async function recordUpdate(
  type: "restaurant" | "event",
  item_name: string,
  action: "added" | "removed" | "updated",
  pool?: Pool
): Promise<DataUpdate> {
  return q1<DataUpdate>(
    `INSERT INTO data_updates (type, item_name, action)
     VALUES ($1,$2,$3) RETURNING *`,
    [type, item_name, action],
    pool
  ) as Promise<DataUpdate>;
}

export function getCronRun(jobName: string, pool?: Pool): Promise<CronRun | undefined> {
  return q1<CronRun>(
    "SELECT * FROM cron_runs WHERE job_name = $1",
    [jobName],
    pool,
  );
}

export async function markCronRun(jobName: string, pool?: Pool): Promise<CronRun> {
  return q1<CronRun>(
    `INSERT INTO cron_runs (job_name, last_ran_at)
     VALUES ($1, NOW())
     ON CONFLICT (job_name)
     DO UPDATE SET last_ran_at = EXCLUDED.last_ran_at
     RETURNING *`,
    [jobName],
    pool,
  ) as Promise<CronRun>;
}

// ── Menu / dietary ────────────────────────────────────────────────────────────

/**
 * Restaurants that are eligible for a menu check:
 * - Already opened (opened_date not containing 'upcoming')
 * - Never checked OR last checked > 7 days ago
 */
export function getRestaurantsNeedingMenuCheck(pool?: Pool): Promise<Restaurant[]> {
  return q<Restaurant>(
    `SELECT * FROM restaurants
     WHERE opened_date NOT ILIKE '%upcoming%'
       AND (menu_checked_at IS NULL
            OR menu_checked_at < NOW() - INTERVAL '7 days')
     ORDER BY menu_checked_at ASC NULLS FIRST`,
    [],
    pool
  );
}

/**
 * Update a restaurant's menu URL, dietary flags, and mark when checked.
 */
export async function updateRestaurantMenu(
  id: number,
  menuUrl: string | null,
  dietaryFlags: DietaryFlags | null,
  pool?: Pool
): Promise<void> {
  await exec(
    `UPDATE restaurants
     SET menu_url = $1,
         dietary_flags = $2,
         menu_checked_at = NOW()
     WHERE id = $3`,
    [menuUrl, dietaryFlags ? JSON.stringify(dietaryFlags) : null, id],
    pool
  );
}
