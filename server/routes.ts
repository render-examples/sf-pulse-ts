import type { Express } from "express";
import type { Server } from "http";
import webpush from "web-push";
import { storage } from "./storage";

// Generate VAPID keys at startup if not set
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BBkwZRCOJzKrYlx_-1XEbGaNmgofTxAaaIRWZzEx8MrA-C52lj6uP4Qv3Eheq3l_2GWXDNZltVpprFNG1N1QAG4";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "tjnOZ1tYY6cLxXallojS1TP7iVIopu4ogMD6XIePbsI";

webpush.setVapidDetails(
  "mailto:sf-pulse@example.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export function registerRoutes(server: Server, app: Express) {
  // Get all restaurants
  app.get("/api/restaurants", (_req, res) => {
    const data = storage.getRestaurants();
    res.json(data);
  });

  // Get all events
  app.get("/api/events", (_req, res) => {
    const data = storage.getEvents();
    res.json(data);
  });

  // Get VAPID public key
  app.get("/api/push/vapid-key", (_req, res) => {
    res.json({ key: VAPID_PUBLIC_KEY });
  });

  // Subscribe to push notifications
  app.post("/api/push/subscribe", (req, res) => {
    try {
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys) {
        return res.status(400).json({ error: "Missing endpoint or keys" });
      }
      const sub = storage.addSubscription({
        endpoint,
        keys: JSON.stringify(keys),
        createdAt: new Date().toISOString(),
      });
      res.json(sub);
    } catch (e: any) {
      // Unique constraint violation = already subscribed
      if (e.message?.includes("UNIQUE")) {
        return res.json({ message: "Already subscribed" });
      }
      res.status(500).json({ error: e.message });
    }
  });

  // Unsubscribe
  app.post("/api/push/unsubscribe", (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
    storage.removeSubscription(endpoint);
    res.json({ message: "Unsubscribed" });
  });

  // Get recent data updates
  app.get("/api/updates", (_req, res) => {
    const updates = storage.getRecentUpdates(50);
    res.json(updates);
  });

  // Get last update timestamp
  app.get("/api/last-updated", (_req, res) => {
    const updates = storage.getRecentUpdates(1);
    const lastUpdated = updates.length > 0 ? updates[0].timestamp : null;
    res.json({ lastUpdated });
  });
}
