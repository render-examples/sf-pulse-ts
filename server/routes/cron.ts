import { Router } from "express";
import type { Pool } from "pg";
import webpush from "web-push";
import * as storage from "../storage.js";
import { broadcast } from "../sse.js";
import { requireCronSecret } from "./middleware.js";

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

async function pushToAll(title: string, body: string, pool?: Pool): Promise<void> {
  const subs = await storage.getSubscriptions(pool);
  const sends = subs.map((sub) =>
    webpush
      .sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title, body })
      )
      .catch(() => {
        storage.removeSubscription(sub.endpoint, pool);
      })
  );
  await Promise.allSettled(sends);
}

export function cronRoutes(pool?: Pool): Router {
  const router = Router();

  router.post("/refresh", requireCronSecret, async (req, res) => {
    const { restaurants = [], events = [] } = req.body as {
      restaurants: storage.NewRestaurant[];
      events: Omit<storage.Event, "id" | "added_at">[];
    };

    const newRestaurants: string[] = [];
    const newEvents: string[] = [];

    for (const r of restaurants) {
      const added = await storage.addRestaurant(r, pool);
      await storage.recordUpdate("restaurant", added.name, "added", pool);
      newRestaurants.push(added.name);
    }

    for (const e of events) {
      const added = await storage.addEvent(e, pool);
      await storage.recordUpdate("event", added.title, "added", pool);
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

      await pushToAll("SF Pulse update", lines.join(" · "), pool);
    }

    res.json({ added: { restaurants: newRestaurants, events: newEvents } });
  });

  return router;
}
