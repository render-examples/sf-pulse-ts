import { Router } from "express";
import { addClient } from "../sse.js";

/**
 * Mounts at /api/events-stream — provides:
 *   GET /api/events-stream
 */
export function sseRoutes(): Router {
  const router = Router();

  router.get("/", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Nginx/Render: disable proxy buffering
    res.flushHeaders();
    const hb = setInterval(() => res.write(": ping\n\n"), 25_000);
    res.on("close", () => clearInterval(hb));
    addClient(res);
  });

  return router;
}
