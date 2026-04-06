import { CRON_USER_AGENT } from "./constants.js";
import { stripHtml } from "./html.js";
import type { RssItem } from "./types.js";

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const stripCdata = (value: string) =>
    value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  const between = (source: string, tag: string): string => {
    const match = source.match(
      new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
    );
    return match ? stripCdata(match[1].trim()) : "";
  };

  const isAtom = /<feed\b/i.test(xml);
  const itemTag = isAtom ? "entry" : "item";
  const chunks = xml.split(new RegExp(`<${itemTag}[\\s>]`, "i"));

  for (let index = 1; index < chunks.length; index++) {
    const chunk = chunks[index];
    const title = stripHtml(between(chunk, "title"));

    let link = "";
    if (isAtom) {
      const linkMatch = chunk.match(/<link\s[^>]*href="([^"]+)"[^>]*\/>/i);
      if (linkMatch) link = linkMatch[1];
    } else {
      link = between(chunk, "link");
    }

    const pubDate = isAtom
      ? between(chunk, "published")
      : between(chunk, "pubDate");
    const description = isAtom
      ? between(chunk, "summary")
      : between(chunk, "description");

    if (title) {
      items.push({ title, link, pubDate, description: stripHtml(description) });
    }
  }

  return items;
}

export async function fetchRss(url: string): Promise<RssItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": CRON_USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch {
    return [];
  }
}
