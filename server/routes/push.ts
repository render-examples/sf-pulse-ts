import { Router } from "express";
import type { Pool } from "pg";
import * as storage from "../storage.js";

export function pushRoutes(pool?: Pool): Router {
  const router = Router();

  router.get("/vapid-key", (_req, res) => {
    const key =
      process.env.VAPID_PUBLIC_KEY ||
      "BBkwZRCOJzKrYlx_-1XEbGaNmgofTxAaaIRWZzEx8MrA-C52lj6uP4Qv3Eheq3l_2GWXDNZltVpprFNG1N1QAG4";
    res.json({ key });
  });

  router.post("/subscribe", async (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Missing endpoint or keys" });
    }
    const sub = await storage.addSubscription(endpoint, keys, pool);
    res.json(sub);
  });

  router.post("/unsubscribe", async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
    await storage.removeSubscription(endpoint, pool);
    res.json({ ok: true });
  });

  return router;
}
