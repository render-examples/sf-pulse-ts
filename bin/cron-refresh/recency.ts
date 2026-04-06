import { THREE_MONTHS_MS } from "./constants.js";

export function isRecent(pubDate: string): boolean {
  if (!pubDate) return true;
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return true;
  return Date.now() - date.getTime() < THREE_MONTHS_MS;
}
