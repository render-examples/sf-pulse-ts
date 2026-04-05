import { Router } from "express";
import type { Pool } from "pg";
import * as storage from "../storage.js";
import { broadcast } from "../sse.js";

export function eventRoutes(pool?: Pool): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await storage.getEvents(pool));
  });

  router.delete("/:id", async (req, res) => {
    await storage.deleteEvent(Number(req.params.id), pool);
    broadcast("events", { action: "refresh" });
    res.json({ ok: true });
  });

  return router;
}
