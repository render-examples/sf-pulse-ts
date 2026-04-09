import type { Pool } from "pg";
import {
  deleteEvent,
  getEventById,
  getVisibleEvents,
  recordUpdate,
} from "../../../server/storage.js";
import { broadcast } from "../../../server/sse.js";
import { requireCronSecret } from "../../../server/routes/middleware.js";
import { json } from "./utils.js";

export async function getEventsResponse(pool?: Pool): Promise<Response> {
  return json(await getVisibleEvents(pool));
}

export async function deleteEventResponse(
  request: Request,
  id: number,
  pool?: Pool,
): Promise<Response> {
  const unauthorized = requireCronSecret(request.headers.get("x-cron-secret"));
  if (unauthorized) return unauthorized;

  const existing = await getEventById(id, pool);
  await deleteEvent(id, pool);

  let version: string | null = null;
  if (existing) {
    version = (await recordUpdate("event", existing.title, "removed", pool)).occurred_at;
  }

  await broadcast("events", {
    version,
    upserted: [],
    deleted: [id],
    summary: existing ? `Removed event: ${existing.title}` : undefined,
  });
  return json({ ok: true });
}
