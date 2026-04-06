import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import * as storage from "./storage.js";
import type { Pool } from "pg";
import type { InitialData } from "../client/src/types";
import { renderInitialDataScript } from "./security.js";

// The SSR server bundle is built by bin/build.ts alongside the client bundle.
// It exports renderApp(data: InitialData): string
let renderApp: ((data: InitialData) => string) | null = null;

function getRenderer(): (data: InitialData) => string {
  if (!renderApp) {
    // __dirname of dist/index.cjs is dist/; the SSR bundle is in dist/public/
    const ssrBundle = path.resolve(__dirname, "public", "ssr-server.cjs");
    if (!fs.existsSync(ssrBundle)) {
      throw new Error(
        `SSR bundle not found at ${ssrBundle}. Run 'npm run build' first.`
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(ssrBundle) as { renderApp: (data: InitialData) => string };
    renderApp = mod.renderApp;
  }
  return renderApp;
}

export function serveStatic(app: Express, pool?: Pool) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(distPath));

  // SSR for every non-asset route
  app.use("/{*path}", async (_req, res, next) => {
    try {
      const indexHtml = fs.readFileSync(
        path.resolve(distPath, "index.html"),
        "utf-8"
      );

      const [restaurants, events, updates] = await Promise.all([
        storage.getRestaurants(pool),
        storage.getEvents(pool),
        storage.getRecentUpdates(1, pool),
      ]);
      const lastUpdated = updates[0]?.occurred_at ?? null;

      const initialData: InitialData = { restaurants, events, lastUpdated };
      const renderer = getRenderer();
      const appHtml = renderer(initialData);

      const html = indexHtml
        .replace("<!--ssr-outlet-->", appHtml)
        .replace("<!--ssr-data-->", renderInitialDataScript(initialData));

      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      next(e);
    }
  });
}
