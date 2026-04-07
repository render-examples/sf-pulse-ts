import type { Pool } from "pg";
import { getEvents, getRestaurants } from "../../../server/storage.js";
import { getPublicAppUrl } from "../../../server/security.js";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function getRssResponse(pool?: Pool): Promise<Response> {
  const appUrl = getPublicAppUrl();
  const [restaurants, events] = await Promise.all([
    getRestaurants(pool),
    getEvents(pool),
  ]);

  const items = [
    ...restaurants.map((restaurant) => ({
      title: `New restaurant: ${restaurant.name}`,
      link: restaurant.source_url ?? appUrl,
      description: [
        restaurant.cuisine,
        restaurant.neighborhood,
        restaurant.address,
        restaurant.opened_date ? `Opened: ${restaurant.opened_date}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      pubDate: new Date(restaurant.added_at).toUTCString(),
      guid: `${appUrl}/restaurants/${restaurant.id}`,
    })),
    ...events.map((event) => ({
      title: event.title,
      link: event.source_url ?? appUrl,
      description: [event.location, event.date, event.time, event.description]
        .filter(Boolean)
        .join(" · "),
      pubDate: new Date(event.added_at).toUTCString(),
      guid: `${appUrl}/events/${event.id}`,
    })),
  ]
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 50);

  const itemsXml = items
    .map(
      (item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.pubDate}</pubDate>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
    </item>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>SF Pulse</title>
    <link>${escapeXml(appUrl)}</link>
    <description>New SF restaurant openings and Mission District events</description>
    <language>en-us</language>
    <atom:link href="${escapeXml(appUrl + "/api/rss.xml")}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${itemsXml}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
