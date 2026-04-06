import { Router } from "express";
import type { Pool } from "pg";
import * as storage from "../storage.js";
import { getPublicAppUrl } from "../security.js";

/**
 * Mounts at /api/rss — provides:
 *   GET /api/rss.xml  — RSS 2.0 feed of recent restaurant openings and events
 */
export function rssRoutes(pool?: Pool): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const appUrl = getPublicAppUrl();

    const [restaurants, events] = await Promise.all([
      storage.getRestaurants(pool),
      storage.getEvents(pool),
    ]);

    // Combine and sort by added_at desc, cap at 50 items
    type FeedItem = {
      title: string;
      link: string;
      description: string;
      pubDate: string;
      guid: string;
    };

    const items: FeedItem[] = [
      ...restaurants.map((r) => ({
        title: `New restaurant: ${r.name}`,
        link: r.source_url ?? appUrl,
        description: [
          r.cuisine,
          r.neighborhood,
          r.address,
          r.opened_date ? `Opened: ${r.opened_date}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        pubDate: new Date(r.added_at).toUTCString(),
        guid: `${appUrl}/restaurants/${r.id}`,
      })),
      ...events.map((e) => ({
        title: e.title,
        link: e.source_url ?? appUrl,
        description: [e.location, e.date, e.time, e.description]
          .filter(Boolean)
          .join(" · "),
        pubDate: new Date(e.added_at).toUTCString(),
        guid: `${appUrl}/events/${e.id}`,
      })),
    ]
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, 50);

    const escape = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const itemsXml = items
      .map(
        (item) => `
    <item>
      <title>${escape(item.title)}</title>
      <link>${escape(item.link)}</link>
      <description>${escape(item.description)}</description>
      <pubDate>${item.pubDate}</pubDate>
      <guid isPermaLink="false">${escape(item.guid)}</guid>
    </item>`
      )
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>SF Pulse</title>
    <link>${escape(appUrl)}</link>
    <description>New SF restaurant openings and Mission District events</description>
    <language>en-us</language>
    <atom:link href="${escape(appUrl + "/api/rss.xml")}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${itemsXml}
  </channel>
</rss>`;

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.send(xml);
  });

  return router;
}
