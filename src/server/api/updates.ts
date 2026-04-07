import type { Pool } from "pg";
import { getRecentUpdates } from "../../../server/storage.js";
import { json } from "./utils.js";

export async function getUpdatesResponse(pool?: Pool): Promise<Response> {
  return json(await getRecentUpdates(50, pool));
}

export async function getLastUpdatedResponse(pool?: Pool): Promise<Response> {
  const updates = await getRecentUpdates(1, pool);
  return json({ lastUpdated: updates[0]?.occurred_at ?? null });
}
