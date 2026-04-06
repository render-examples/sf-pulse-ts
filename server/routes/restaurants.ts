import { Router } from "express";
import type { Pool } from "pg";
import * as storage from "../storage.js";
import { broadcast } from "../sse.js";
import { requireCronSecret } from "./middleware.js";

export function restaurantRoutes(pool?: Pool): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await storage.getRestaurants(pool));
  });

  router.delete("/:id", requireCronSecret, async (req, res) => {
    await storage.deleteRestaurant(Number(req.params.id), pool);
    await broadcast("restaurants", { action: "refresh" });
    res.json({ ok: true });
  });

  return router;
}
