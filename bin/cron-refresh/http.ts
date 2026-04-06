import { CRON_USER_AGENT } from "./constants.js";
import { stripHtml } from "./html.js";

export async function searchWeb(q: string): Promise<string> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    {
      headers: { "User-Agent": CRON_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    },
  );
  return res.ok ? res.text() : "";
}

export async function fetchPageHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": CRON_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  }
}

export async function fetchPageText(url: string): Promise<string> {
  const html = await fetchPageHtml(url);
  return html ? stripHtml(html) : "";
}
