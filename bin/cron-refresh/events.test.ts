import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractEvents,
  fetchCalAcademy,
  fetchFAMSF,
  fetchFuncheap,
  parseCalAcademyPage,
  parseFAMSFPage,
  stripHtml,
} from "../cron-refresh.js";
import { readFixture } from "./test-helpers.js";
import { normalizeDateText } from "../../shared/dates.ts";
import { buildEventIdentityKey } from "../../shared/event-identity.ts";

const ddgEventsAnomalyHtml = readFixture("ddg-events-anomaly-page.html");
const famsfCalendarHtml = readFixture("famsf-calendar-live.html");
const calAcademyEventsHtml = readFixture("calacademy-events-live.html");
const funcheapFeedXml = readFixture("funcheap-feed-live.xml");

function eventKey(title: string, location: string, date: string): string {
  return buildEventIdentityKey({
    title,
    location,
    dateText: normalizeDateText(date),
  });
}

describe("extractEvents()", () => {
  it("extracts an event with a month-day date", () => {
    const results = extractEvents(
      "Mission Street Fair on April 15 draws thousands.",
      [],
    );
    assert.ok(results.length >= 1);
    const event = results.find((result) =>
      result.title.includes("Mission Street Fair"),
    );
    assert.ok(event);
    assert.ok(event!.date.includes("April"));
  });

  it("deduplicates case-insensitively against existing list", () => {
    const text = "Mission Street Fair on April 15 draws thousands.";
    const first = extractEvents(text, []);
    assert.ok(first.length >= 1);
    assert.deepEqual(
      extractEvents(
        text,
        [eventKey(first[0].title, first[0].location, first[0].date)],
      ),
      [],
    );
  });

  it("deduplicates within a single run", () => {
    const results = extractEvents(
      "Mission Street Fair on April 15. Mission Street Fair on April 15.",
      [],
    );
    const titles = results.map((event) => event.title);
    assert.equal(new Set(titles).size, titles.length);
  });

  it("caps results at 10", () => {
    const lines = Array.from({ length: 15 }, (_, index) =>
      `Event Alpha${index.toString().padStart(2, "0")} on April ${index + 1}`,
    ).join(". ");
    assert.ok(extractEvents(lines, []).length <= 10);
  });

  it("sets expected default fields on each result", () => {
    const [event] = extractEvents("Carnaval Festival on May 23 is coming.", []);
    assert.ok(event);
    assert.equal(event.location, "Mission District, San Francisco");
    assert.equal(event.time, null);
    assert.equal(event.description, null);
    assert.equal(event.source_url, null);
  });

  it("returns empty array when no patterns match", () => {
    assert.deepEqual(extractEvents("nothing here", []), []);
  });

  it("ignores search-query style text with a month-year suffix", () => {
    assert.deepEqual(
      extractEvents(
        "San Francisco events Golden Gate Park concerts April 2026",
        [],
      ),
      [],
    );
  });

  it("ignores weekday-only titles", () => {
    assert.deepEqual(extractEvents("Sunday April 6, 2026", []), []);
  });

  it("html-escapes extracted titles", () => {
    const results = extractEvents(`Artist's Night & Day on April 15, 2026.`, []);
    assert.equal(results[0]?.title, "Artist&#39;s Night &amp; Day");
  });
});

describe("DuckDuckGo event fallback fixtures", () => {
  it("does not synthesize events from a saved anomaly page", () => {
    assert.deepEqual(extractEvents(stripHtml(ddgEventsAnomalyHtml), []), []);
  });
});

describe("parseFAMSFPage()", () => {
  it("extracts event titles and dates from saved live calendar HTML", () => {
    const events = parseFAMSFPage(famsfCalendarHtml, []);
    assert.ok(events.length >= 5);
    assert.ok(
      events.some(
        (event) =>
          event.title === "A Closer Look: The Etruscans" &&
          event.date === "May 9",
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.title === "Monet and Venice Access Day" &&
          event.date === "May 11",
      ),
    );
  });

  it("deduplicates against existing list for saved live HTML", () => {
    const events = parseFAMSFPage(famsfCalendarHtml, [
      eventKey(
        "A Closer Look: The Etruscans",
        "Fine Arts Museums of San Francisco",
        "May 9",
      ),
    ]);
    assert.ok(
      !events.some((event) => event.title === "A Closer Look: The Etruscans"),
    );
  });

  it("sets source_url and location for saved live HTML", () => {
    const events = parseFAMSFPage(famsfCalendarHtml, []);
    assert.ok(
      events.every(
        (event) =>
          event.source_url === "https://www.famsf.org/calendar" &&
          event.location === "Fine Arts Museums of San Francisco",
      ),
    );
  });
});

describe("parseCalAcademyPage()", () => {
  it("extracts event titles and dates from saved live events HTML", () => {
    const events = parseCalAcademyPage(calAcademyEventsHtml, []);
    assert.ok(events.length >= 2);
    assert.ok(
      events.some(
        (event) => event.title === "Yalla! NightLife" && event.date === "April 9",
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.title === "Big Bang: Party After Dark" &&
          event.date === "April 23, 2026",
      ),
    );
  });

  it("filters non-event content from saved live HTML", () => {
    const events = parseCalAcademyPage(calAcademyEventsHtml, []);
    assert.ok(!events.some((event) => event.title === "Steinhart Aquarium"));
    assert.ok(!events.some((event) => event.title === "New & featured"));
  });

  it("sets source_url and location for saved live HTML", () => {
    const events = parseCalAcademyPage(calAcademyEventsHtml, []);
    assert.ok(
      events.every(
        (event) =>
          event.source_url === "https://www.calacademy.org/events" &&
          event.location ===
            "California Academy of Sciences, Golden Gate Park",
      ),
    );
  });
});

describe("fetchFAMSF()", () => {
  it("parses the saved live FAMSF fixture through the fetch wrapper", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(famsfCalendarHtml, { status: 200 })) as typeof fetch;

    try {
      const events = await fetchFAMSF([]);
      assert.ok(
        events.some(
          (event) =>
            event.title === "A Closer Look: The Etruscans" &&
            event.date === "May 9",
        ),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("fetchCalAcademy()", () => {
  it("parses the saved live Cal Academy fixture through the fetch wrapper", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(calAcademyEventsHtml, { status: 200 })) as typeof fetch;

    try {
      const events = await fetchCalAcademy([]);
      assert.ok(
        events.some(
          (event) =>
            event.title === "Yalla! NightLife" && event.date === "April 9",
        ),
      );
      assert.ok(
        events.some(
          (event) =>
            event.title === "Big Bang: Party After Dark" &&
            event.date === "April 23, 2026",
        ),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("fetchFuncheap()", () => {
  it("strips date prefix and FREE suffix from a saved live feed", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(funcheapFeedXml, { status: 200 })) as typeof fetch;

    try {
      const events = await fetchFuncheap([]);
      assert.ok(events.length >= 4);
      assert.ok(
        events.some(
          (event) =>
            event.title ===
              "Nike Missile Site Open House &#038; Storytelling | Marin Headlands" &&
            event.date === "July 4, 2026",
        ),
      );
      assert.ok(
        events.some(
          (event) =>
            event.title ===
              "Free &#8220;Legion of Honor&#8221; Museum Day for Bay Area Residents (Every Saturday)" &&
            event.date === "May 30, 2026",
        ),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
