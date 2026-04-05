import type { Express } from "express";
import type { Server } from "http";
import webpush from "web-push";
import * as storage from "./storage.js";
import { addClient, broadcast } from "./sse.js";

const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BBkwZRCOJzKrYlx_-1XEbGaNmgofTxAaaIRWZzEx8MrA-C52lj6uP4Qv3Eheq3l_2GWXDNZltVpprFNG1N1QAG4";
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "tjnOZ1tYY6cLxXallojS1TP7iVIopu4ogMD6XIePbsI";

webpush.setVapidDetails(
  "mailto:sf-pulse@example.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

async function pushToAll(title: string, body: string): Promise<void> {
  const subs = await storage.getSubscriptions();
  const sends = subs.map((sub) =>
    webpush
      .sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title, body })
      )
      .catch(() => {
        // Remove dead subscriptions silently
        storage.removeSubscription(sub.endpoint);
      })
  );
  await Promise.allSettled(sends);
}

export function registerRoutes(server: Server, app: Express): void {
  // ── SSE stream ─────────────────────────────────────────────────────────────
  app.get("/api/events-stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Nginx/Render: disable proxy buffering
    res.flushHeaders();
    // Heartbeat every 25s to prevent idle disconnects
    const hb = setInterval(() => res.write(": ping\n\n"), 25_000);
    res.on("close", () => clearInterval(hb));
    addClient(res);
  });

  // ── Restaurants ────────────────────────────────────────────────────────────
  app.get("/api/restaurants", async (_req, res) => {
    res.json(await storage.getRestaurants());
  });

  app.delete("/api/restaurants/:id", async (req, res) => {
    await storage.deleteRestaurant(Number(req.params.id));
    broadcast("restaurants", { action: "refresh" });
    res.json({ ok: true });
  });

  // ── Events ─────────────────────────────────────────────────────────────────
  app.get("/api/events", async (_req, res) => {
    res.json(await storage.getEvents());
  });

  app.delete("/api/events/:id", async (req, res) => {
    await storage.deleteEvent(Number(req.params.id));
    broadcast("events", { action: "refresh" });
    res.json({ ok: true });
  });

  // ── Cron trigger (called by Render cron job) ───────────────────────────────
  // Protected by a shared secret so it can't be triggered arbitrarily.
  app.post("/api/cron/refresh", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers["x-cron-secret"] !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { restaurants = [], events = [] } = req.body as {
      restaurants: Omit<storage.Restaurant, "id" | "added_at">[];
      events: Omit<storage.Event, "id" | "added_at">[];
    };

    const newRestaurants: string[] = [];
    const newEvents: string[] = [];

    for (const r of restaurants) {
      const added = await storage.addRestaurant(r);
      await storage.recordUpdate("restaurant", added.name, "added");
      newRestaurants.push(added.name);
    }

    for (const e of events) {
      const added = await storage.addEvent(e);
      await storage.recordUpdate("event", added.title, "added");
      newEvents.push(added.title);
    }

    if (newRestaurants.length > 0 || newEvents.length > 0) {
      broadcast("restaurants", { action: "refresh" });
      broadcast("events", { action: "refresh" });

      const lines: string[] = [];
      if (newRestaurants.length)
        lines.push(`${newRestaurants.length} new restaurant${newRestaurants.length > 1 ? "s" : ""}: ${newRestaurants.join(", ")}`);
      if (newEvents.length)
        lines.push(`${newEvents.length} new event${newEvents.length > 1 ? "s" : ""}: ${newEvents.join(", ")}`);

      await pushToAll("SF Pulse update", lines.join(" · "));
    }

    res.json({ added: { restaurants: newRestaurants, events: newEvents } });
  });

  // ── Push subscriptions ─────────────────────────────────────────────────────
  app.get("/api/push/vapid-key", (_req, res) => {
    res.json({ key: VAPID_PUBLIC_KEY });
  });

  app.post("/api/push/subscribe", async (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Missing endpoint or keys" });
    }
    const sub = await storage.addSubscription(endpoint, keys);
    res.json(sub);
  });

  app.post("/api/push/unsubscribe", async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
    await storage.removeSubscription(endpoint);
    res.json({ ok: true });
  });

  // ── Misc ───────────────────────────────────────────────────────────────────
  app.get("/api/updates", async (_req, res) => {
    res.json(await storage.getRecentUpdates());
  });

  app.get("/api/last-updated", async (_req, res) => {
    const updates = await storage.getRecentUpdates(1);
    res.json({ lastUpdated: updates[0]?.occurred_at ?? null });
  });
}
