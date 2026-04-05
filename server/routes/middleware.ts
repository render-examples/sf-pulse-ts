import type { Request, Response, NextFunction } from "express";

/**
 * Express middleware that gates a route behind CRON_SECRET.
 * Missing configuration fails closed so mutation endpoints never become public.
 */
export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: "CRON_SECRET is not configured" });
    return;
  }
  if (req.headers["x-cron-secret"] !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
