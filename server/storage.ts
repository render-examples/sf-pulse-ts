import type { Pool } from "pg";
import { pool as defaultPool, query, queryOne, execute } from "./db.js";

export interface Restaurant {
  id: number;
  name: string;
  neighborhood: string;
  cuisine: string;
  address: string | null;
  opened_date: string;
  source_url: string | null;
  added_at: string;
}

export interface Event {
  id: number;
  title: string;
  location: string;
  date: string;
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

// ── Restaurants ──────────────────────────────────────────────────────────────

export function getRestaurants(pool?: Pool): Promise<Restaurant[]> {
  return q<Restaurant>("SELECT * FROM restaurants ORDER BY added_at DESC", [], pool);
}

export async function addRestaurant(
  r: Omit<Restaurant, "id" | "added_at">,
  pool?: Pool
): Promise<Restaurant> {
  return q1<Restaurant>(
    `INSERT INTO restaurants (name, neighborhood, cuisine, address, opened_date, source_url)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [r.name, r.neighborhood, r.cuisine, r.address ?? null, r.opened_date, r.source_url ?? null],
    pool
  ) as Promise<Restaurant>;
}

export async function clearRestaurants(pool?: Pool): Promise<void> {
  await exec("DELETE FROM restaurants", [], pool);
}

export async function deleteRestaurant(id: number, pool?: Pool): Promise<void> {
  await exec("DELETE FROM restaurants WHERE id=$1", [id], pool);
}

// ── Events ───────────────────────────────────────────────────────────────────

export function getEvents(pool?: Pool): Promise<Event[]> {
  return q<Event>("SELECT * FROM events ORDER BY added_at DESC", [], pool);
}

export async function addEvent(
  e: Omit<Event, "id" | "added_at">,
  pool?: Pool
): Promise<Event> {
  return q1<Event>(
    `INSERT INTO events (title, location, date, time, description, source_url)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [e.title, e.location, e.date, e.time ?? null, e.description ?? null, e.source_url ?? null],
    pool
  ) as Promise<Event>;
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
