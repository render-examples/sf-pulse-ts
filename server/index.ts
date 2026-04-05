import { createApp } from "./app.js";
import { serveStatic } from "./static.js";

const { app, httpServer } = createApp();

(async () => {
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    console.log(`[express] serving on port ${port}`);
  });
})();
