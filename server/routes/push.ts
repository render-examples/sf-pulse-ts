import { Router } from "express";
import type { Pool } from "pg";
import * as storage from "../storage.js";
import {
  getVapidPublicKey,
  parsePushSubscriptionBody,
  parsePushUnsubscribeBody,
} from "../security.js";

export function pushRoutes(pool?: Pool): Router {
  const router = Router();

  router.get("/vapid-key", (_req, res) => {
    res.json({ key: getVapidPublicKey() });
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
