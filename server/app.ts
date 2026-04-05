/**
 * Express app factory.
 *
 * Separated from server/index.ts so tests can create an app instance with an
 * injected pg-mem pool without binding to a port or touching DATABASE_URL.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import type { Pool } from "pg";
import { registerRoutes } from "./routes/index.js";

export interface AppInstance {
  app: ReturnType<typeof express>;
  httpServer: Server;
}

export function createApp(pool?: Pool): AppInstance {
  const app = express();
  const httpServer = createServer(app);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  registerRoutes(httpServer, app, pool);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      (err as { status?: number }).status ||
      (err as { statusCode?: number }).statusCode ||
      500;
    const message = (err as Error).message || "Internal Server Error";
    if (!res.headersSent) res.status(status).json({ message });
  });

  return { app, httpServer };
}
