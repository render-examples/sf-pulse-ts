import type { Pool } from "pg";
import { deleteEvent, getVisibleEvents } from "../../../server/storage.js";
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

  await deleteEvent(id, pool);
  await broadcast("events", { action: "refresh" });
  return json({ ok: true });
}
