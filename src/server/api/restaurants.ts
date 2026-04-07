import type { Pool } from "pg";
import { deleteRestaurant, getVisibleRestaurants } from "../../../server/storage.js";
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

  await deleteRestaurant(id, pool);
  await broadcast("restaurants", { action: "refresh" });
  return json({ ok: true });
}
