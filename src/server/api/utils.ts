import type { Pool } from "pg";
import { getVisibleRestaurants, getVisibleEvents, getRecentUpdates } from "../../../server/storage.js";
import type { InitialData } from "../../../shared/types.ts";

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

export async function getInitialData(pool?: Pool): Promise<InitialData> {
  const [restaurants, events, updates] = await Promise.all([
    getVisibleRestaurants(pool),
    getVisibleEvents(pool),
    getRecentUpdates(1, pool),
  ]);

  return {
    restaurants,
    events,
    lastUpdated: updates[0]?.occurred_at ?? null,
  };
}
