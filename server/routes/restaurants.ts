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
    broadcast("restaurants", { action: "refresh" });
    res.json({ ok: true });
  });

  // ── Menu discovery (called by cron job) ─────────────────────────────────
  router.get("/needing-menu-check", requireCronSecret, async (_req, res) => {
    const restaurants = await storage.getRestaurantsNeedingMenuCheck(pool);
    res.json(restaurants.map((r) => ({ id: r.id, name: r.name })));
  });

  router.put("/:id/menu", requireCronSecret, async (req, res) => {
    const { menuUrl, dietaryFlags } = req.body as {
      menuUrl: string | null;
      dietaryFlags: storage.DietaryFlags | null;
    };
    await storage.updateRestaurantMenu(Number(req.params.id), menuUrl, dietaryFlags, pool);
    broadcast("restaurants", { action: "refresh" });
    res.json({ ok: true });
  });

  return router;
}
