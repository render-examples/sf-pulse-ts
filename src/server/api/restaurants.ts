import type { Pool } from "pg";
import {
  deleteRestaurant,
  getRestaurantById,
  getVisibleRestaurants,
  recordUpdate,
} from "../../../server/storage.js";
import { broadcast } from "../../../server/sse.js";
import { requireCronSecret } from "../../../server/routes/middleware.js";
import { json } from "./utils.js";

export async function getRestaurantsResponse(pool?: Pool): Promise<Response> {
  return json(await getVisibleRestaurants(pool));
}

export async function deleteRestaurantResponse(
  request: Request,
  id: number,
  pool?: Pool,
): Promise<Response> {
  const unauthorized = requireCronSecret(request.headers.get("x-cron-secret"));
  if (unauthorized) return unauthorized;

  const existing = await getRestaurantById(id, pool);
  await deleteRestaurant(id, pool);

  let version: string | null = null;
  if (existing) {
    version = (await recordUpdate("restaurant", existing.name, "removed", pool)).occurred_at;
  }

  await broadcast("restaurants", {
    version,
    upserted: [],
    deleted: [id],
    summary: existing ? `Removed restaurant: ${existing.name}` : undefined,
  });
  return json({ ok: true });
}
