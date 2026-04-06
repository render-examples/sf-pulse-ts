import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import path from "path";
import { nanoid } from "nanoid";
import * as storage from "./storage.js";
import type { Pool } from "pg";
import type { InitialData } from "../client/src/types";
import { renderInitialDataScript } from "./security.js";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express, pool?: Pool) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // Load template fresh on every request in dev (HMR)
      let template = await import("fs").then((fs) =>
        fs.promises.readFile(clientTemplate, "utf-8")
      );
      template = template.replace(
        `src="/src/entry-client.tsx"`,
        `src="/src/entry-client.tsx?v=${nanoid()}"`,
      );
      template = await vite.transformIndexHtml(url, template);

      // Fetch data server-side
      const [restaurants, events, updates] = await Promise.all([
        storage.getRestaurants(pool),
        storage.getEvents(pool),
        storage.getRecentUpdates(1, pool),
      ]);
      const lastUpdated = updates[0]?.occurred_at ?? null;

      const initialData: InitialData = { restaurants, events, lastUpdated };

      // SSR render via Vite's module graph (picks up HMR changes)
      const { renderApp } = (await vite.ssrLoadModule(
        "/src/entry-server.tsx"
      )) as { renderApp: (data: InitialData) => string };

      const appHtml = renderApp(initialData);

      const html = template
        .replace("<!--ssr-outlet-->", appHtml)
        .replace("<!--ssr-data-->", renderInitialDataScript(initialData));

      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
