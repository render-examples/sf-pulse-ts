import { query, queryOne, execute } from "./db.js";

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

// ── Restaurants ──────────────────────────────────────────────────────────────

export function getRestaurants(): Promise<Restaurant[]> {
  return query<Restaurant>(
    "SELECT * FROM restaurants ORDER BY added_at DESC"
  );
}

export async function addRestaurant(r: Omit<Restaurant, "id" | "added_at">): Promise<Restaurant> {
  return queryOne<Restaurant>(
    `INSERT INTO restaurants (name, neighborhood, cuisine, address, opened_date, source_url)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [r.name, r.neighborhood, r.cuisine, r.address ?? null, r.opened_date, r.source_url ?? null]
  ) as Promise<Restaurant>;
}

export async function clearRestaurants(): Promise<void> {
  await execute("DELETE FROM restaurants");
}

export async function deleteRestaurant(id: number): Promise<void> {
  await execute("DELETE FROM restaurants WHERE id=$1", [id]);
}

// ── Events ───────────────────────────────────────────────────────────────────

export function getEvents(): Promise<Event[]> {
  return query<Event>("SELECT * FROM events ORDER BY added_at DESC");
}

export async function addEvent(e: Omit<Event, "id" | "added_at">): Promise<Event> {
  return queryOne<Event>(
    `INSERT INTO events (title, location, date, time, description, source_url)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [e.title, e.location, e.date, e.time ?? null, e.description ?? null, e.source_url ?? null]
  ) as Promise<Event>;
}

export async function clearEvents(): Promise<void> {
  await execute("DELETE FROM events");
}

export async function deleteEvent(id: number): Promise<void> {
  await execute("DELETE FROM events WHERE id=$1", [id]);
}

// ── Push subscriptions ────────────────────────────────────────────────────────

export function getSubscriptions(): Promise<PushSubscription[]> {
  return query<PushSubscription>("SELECT * FROM push_subscriptions");
}

export async function addSubscription(
  endpoint: string,
  keys: { p256dh: string; auth: string }
): Promise<PushSubscription> {
  return queryOne<PushSubscription>(
    `INSERT INTO push_subscriptions (endpoint, keys)
     VALUES ($1,$2)
     ON CONFLICT (endpoint) DO UPDATE SET keys=EXCLUDED.keys
     RETURNING *`,
    [endpoint, JSON.stringify(keys)]
  ) as Promise<PushSubscription>;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await execute("DELETE FROM push_subscriptions WHERE endpoint=$1", [endpoint]);
}

// ── Data updates ──────────────────────────────────────────────────────────────

export function getRecentUpdates(limit = 50): Promise<DataUpdate[]> {
  return query<DataUpdate>(
    "SELECT * FROM data_updates ORDER BY occurred_at DESC LIMIT $1",
    [limit]
  );
}

export async function recordUpdate(
  type: "restaurant" | "event",
  item_name: string,
  action: "added" | "removed" | "updated"
): Promise<DataUpdate> {
  return queryOne<DataUpdate>(
    `INSERT INTO data_updates (type, item_name, action)
     VALUES ($1,$2,$3) RETURNING *`,
    [type, item_name, action]
  ) as Promise<DataUpdate>;
}
