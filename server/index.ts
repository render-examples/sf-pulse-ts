import { createApp } from "./app.js";
import { serveStatic } from "./static.js";
import { pool } from "./db.js";
import { initializeRealtime } from "./sse.js";

const { app, httpServer } = createApp();

(async () => {
  if (process.env.NODE_ENV === "production" && !process.env.CRON_SECRET) {
    throw new Error("CRON_SECRET must be configured in production");
  }

  if (process.env.NODE_ENV === "production") {
    serveStatic(app, pool);
  } else {
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app, pool);
  }

  await initializeRealtime();

  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "0.0.0.0";
  httpServer.listen({ port, host }, () => {
    console.log(`[express] serving on port ${port}`);
  });
})();
