import type { Express } from "express";
import type { Server } from "http";
import type { Pool } from "pg";
import { restaurantRoutes } from "./restaurants.js";
import { eventRoutes } from "./events.js";
import { cronRoutes } from "./cron.js";
import { pushRoutes } from "./push.js";
import { updateRoutes } from "./updates.js";
import { sseRoutes } from "./sse.js";
import { rssRoutes } from "./rss.js";

export function registerRoutes(_server: Server, app: Express, pool?: Pool): void {
  app.use("/api/restaurants", restaurantRoutes(pool));
  app.use("/api/events", eventRoutes(pool));
  app.use("/api/cron", cronRoutes(pool));
  app.use("/api/push", pushRoutes(pool));
  app.use("/api/updates", updateRoutes(pool));
  app.use("/api/events-stream", sseRoutes());
  app.use("/api/rss.xml", rssRoutes(pool));
}
