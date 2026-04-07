import { secretsEqual } from "../security.js";

export function requireCronSecret(actualSecret: unknown): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!secretsEqual(secret, actualSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
