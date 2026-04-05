import { Router } from "express";
import type { Pool } from "pg";
import * as storage from "../storage.js";

/**
 * Mounts at /api/updates — provides:
 *   GET /api/updates
 *   GET /api/updates/last-updated
 */
export function updateRoutes(pool?: Pool): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await storage.getRecentUpdates(50, pool));
  });

  router.get("/last-updated", async (_req, res) => {
    const updates = await storage.getRecentUpdates(1, pool);
    res.json({ lastUpdated: updates[0]?.occurred_at ?? null });
  });

  return router;
}
