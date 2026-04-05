import { createApp } from "./app.js";
import { serveStatic } from "./static.js";
import { pool } from "./db.js";

const { app, httpServer } = createApp();

(async () => {
  if (process.env.NODE_ENV === "production") {
    serveStatic(app, pool);
  } else {
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app, pool);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    console.log(`[express] serving on port ${port}`);
  });
})();
