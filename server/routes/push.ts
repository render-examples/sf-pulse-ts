import { Router } from "express";
import type { Pool } from "pg";
import * as storage from "../storage.js";
import {
  parsePushSubscriptionBody,
  parsePushUnsubscribeBody,
} from "../security.js";

export function pushRoutes(pool?: Pool): Router {
  const router = Router();

  router.get("/vapid-key", (_req, res) => {
    const key =
      process.env.VAPID_PUBLIC_KEY ||
      "BBkwZRCOJzKrYlx_-1XEbGaNmgofTxAaaIRWZzEx8MrA-C52lj6uP4Qv3Eheq3l_2GWXDNZltVpprFNG1N1QAG4";
    res.json({ key });
  });

  router.post("/subscribe", async (req, res) => {
    const parsed = parsePushSubscriptionBody(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid subscription" });
    }
    const { endpoint, keys } = parsed.data;
    const sub = await storage.addSubscription(endpoint, keys, pool);
    res.json(sub);
  });

  router.post("/unsubscribe", async (req, res) => {
    const parsed = parsePushUnsubscribeBody(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid subscription" });
    }
    const { endpoint } = parsed.data;
    await storage.removeSubscription(endpoint, pool);
    res.json({ ok: true });
  });

  return router;
}
