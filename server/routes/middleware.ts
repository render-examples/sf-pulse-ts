import type { Request, Response, NextFunction } from "express";

/**
 * Express middleware that gates a route behind CRON_SECRET.
 * If CRON_SECRET is not set, the route is open (dev / test).
 */
export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers["x-cron-secret"] !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
