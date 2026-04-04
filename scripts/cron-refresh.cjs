"use strict";

// scripts/cron-refresh.ts
var import_promises = require("fs/promises");
var import_fs = require("fs");
var APP_URL = process.env.APP_URL ? `https://${process.env.APP_URL}` : "http://localhost:5000";
var CRON_SECRET = process.env.CRON_SECRET ?? "";
var STATE_DIR = "/var/data";
var STATE_FILE = `${STATE_DIR}/sf-pulse-last-run.json`;
async function loadState() {
  try {
    const raw = await (0, import_promises.readFile)(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { restaurantNames: [], eventTitles: [], lastRunAt: "" };
  }
}
async function saveState(state) {
  if (!(0, import_fs.existsSync)(STATE_DIR)) await (0, import_promises.mkdir)(STATE_DIR, { recursive: true });
  await (0, import_promises.writeFile)(STATE_FILE, JSON.stringify(state, null, 2));
}
async function searchWeb(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "sf-pulse-cron/1.0" },
    signal: AbortSignal.timeout(1e4)
  });
  if (!res.ok) return "";
  return res.text();
}
function extractText(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8e3);
}
async function fetchCurrentLists() {
  const [rRes, eRes] = await Promise.all([
    fetch(`${APP_URL}/api/restaurants`),
    fetch(`${APP_URL}/api/events`)
  ]);
  const restaurants = await rRes.json();
  const events = await eRes.json();
  return {
    restaurantNames: restaurants.map((r) => r.name.toLowerCase()),
    eventTitles: events.map((e) => e.title.toLowerCase())
  };
}
function parseRestaurants(text, existing) {
  const now = /* @__PURE__ */ new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const found = [];
  const namePattern = /["']([A-Z][^"']{2,40})["']\s*(?:opens?|opened|opening|debuts?|now open)/gi;
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (!existing.includes(name.toLowerCase()) && !found.find((f) => f.name === name)) {
      found.push({
        name,
        neighborhood: "San Francisco",
        cuisine: "New opening",
        address: null,
        opened_date: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
        source_url: null
      });
    }
  }
  return found;
}
function parseMissionEvents(text, existing) {
  const found = [];
  const eventPattern = /([A-Z][A-Za-z &:'-]{4,60})\s+(?:on\s+|[-–]\s*)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?)/g;
  let match;
  while ((match = eventPattern.exec(text)) !== null) {
    const title = match[1].trim().replace(/\s+/g, " ");
    const date = match[2].trim();
    if (!existing.includes(title.toLowerCase()) && !found.find((f) => f.title === title)) {
      found.push({
        title,
        location: "Mission District, San Francisco",
        date,
        time: null,
        description: null,
        source_url: null
      });
    }
  }
  return found.slice(0, 10);
}
async function main() {
  console.log(`[cron] SF Pulse refresh \u2014 ${(/* @__PURE__ */ new Date()).toISOString()}`);
  const [state, current] = await Promise.all([loadState(), fetchCurrentLists()]);
  const now = /* @__PURE__ */ new Date();
  const monthYear = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const [rHtml, eHtml] = await Promise.all([
    searchWeb(`new restaurant openings San Francisco ${monthYear}`),
    searchWeb(`Mission District San Francisco events ${monthYear}`)
  ]);
  const rText = extractText(rHtml);
  const eText = extractText(eHtml);
  const newRestaurants = parseRestaurants(rText, current.restaurantNames);
  const newEvents = parseMissionEvents(eText, current.eventTitles);
  console.log(`[cron] found ${newRestaurants.length} new restaurants, ${newEvents.length} new events`);
  if (newRestaurants.length > 0 || newEvents.length > 0) {
    const res = await fetch(`${APP_URL}/api/cron/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": CRON_SECRET
      },
      body: JSON.stringify({ restaurants: newRestaurants, events: newEvents })
    });
    const body = await res.json();
    console.log("[cron] refresh response:", body);
  } else {
    console.log("[cron] no new items, nothing to push");
  }
  await saveState({
    restaurantNames: current.restaurantNames,
    eventTitles: current.eventTitles,
    lastRunAt: now.toISOString()
  });
  console.log("[cron] done");
}
main().catch((err) => {
  console.error("[cron] error:", err);
  process.exit(1);
});
