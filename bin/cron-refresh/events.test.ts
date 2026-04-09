import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractEvents,
  fetchCalAcademy,
  fetchFAMSF,
  fetchFuncheap,
  parseCalAcademyPage,
  parseFAMSFPage,
  parseFuncheapEventPage,
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
              "Nike Missile Site Open House &amp; Storytelling | Marin Headlands" &&
            event.date === "July 4, 2026",
        ),
      );
      assert.ok(
        events.some(
          (event) =>
            event.title ===
              "Free “Legion of Honor” Museum Day for Bay Area Residents (Every Saturday)" &&
            event.date === "May 30, 2026",
        ),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("parseFuncheapEventPage()", () => {
  it("prefers JSON-LD event metadata for exact date, time, location, and description", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "http://schema.org",
              "@type": "Event",
              "name": "&#8220;Poets of the TL&#8221; Block Party + Free Food (Dodge Alley)",
              "description": "Submitted by the Event Organizer Celebrate National Poetry Month in the Tenderloin.",
              "startDate": "2026-04-09T17:00:00-07:00",
              "endDate": "2026-04-09T20:00:00-07:00",
              "location": {
                "@type": "Place",
                "name": "Dodge Alley",
                "address": {
                  "@type": "PostalAddress",
                  "streetAddress": "Dodge Alley",
                  "addressLocality": "San Francisco",
                  "addressRegion": "CA"
                }
              }
            }
          </script>
        </head>
      </html>
    `;

    assert.deepEqual(
      parseFuncheapEventPage(
        html,
        "https://sf.funcheap.com/poets-tl-block-party-free-food-dodge-alley/",
      ),
      {
        title: "“Poets of the TL” Block Party + Free Food (Dodge Alley)",
        location: "Dodge Alley, San Francisco, CA",
        date: "April 9, 2026",
        time: "5:00 PM – 8:00 PM",
        description: "Celebrate National Poetry Month in the Tenderloin.",
        source_url:
          "https://sf.funcheap.com/poets-tl-block-party-free-food-dodge-alley/",
      },
    );
  });

  it("rejects Bay Area JSON-LD events that are not San Francisco-specific", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "http://schema.org",
          "@type": "Event",
          "name": "&#8220;Healthy Parks Healthy People&#8221;: Monthly Nature Walks | Bay Area",
          "description": "Bay Area walk series",
          "startDate": "2026-07-04T10:00:00-07:00",
          "endDate": "2026-07-04T12:00:00-07:00",
          "location": {
            "@type": "Place",
            "name": "San Francisco Bay Area"
          }
        }
      </script>
    `;

    assert.equal(
      parseFuncheapEventPage(
        html,
        "https://sf.funcheap.com/healthy-parks-healthy-people-monthly-nature-walks-bay-area-114/",
      ),
      null,
    );
  });

  it("prefers cleaner page descriptions and collapses same-day local ranges", () => {
    const html = `
      <html>
        <head>
          <meta
            property="og:description"
            content="Spend your Saturday with KQED at a free, festive block party and open house in San Francisco’s Mission District."
          />
          <script type="application/ld+json">
            {
              "@context": "http://schema.org",
              "@type": "Event",
              "name": "SF’s &#8220;KQED Fest&#8221; Free Block Party + Open House (2026)",
              "description": "@kqedKQED Fest 2026 is a free block party in the Mission. Original Event Description: long duplicated body. Text extracted from provided image: poster text.",
              "startDate": "2026-05-09T11:00:00-07:00",
              "endDate": "2026-05-09T18:00:00-07:00",
              "location": {
                "@type": "Place",
                "name": "KQED Headquarters",
                "address": {
                  "@type": "PostalAddress",
                  "streetAddress": "2601 Mariposa St",
                  "addressLocality": "San Francisco",
                  "addressRegion": "CA"
                }
              }
            }
          </script>
        </head>
      </html>
    `;

    assert.deepEqual(
      parseFuncheapEventPage(
        html,
        "https://sf.funcheap.com/sfs-kqed-fest-free-block-party-open-house-2026/",
      ),
      {
        title: "SF’s “KQED Fest” Free Block Party + Open House (2026)",
        location: "KQED Headquarters, 2601 Mariposa St, San Francisco, CA",
        date: "May 9, 2026",
        time: "11:00 AM – 6:00 PM",
        description:
          "Spend your Saturday with KQED at a free, festive block party and open house in San Francisco’s Mission District.",
        source_url:
          "https://sf.funcheap.com/sfs-kqed-fest-free-block-party-open-house-2026/",
      },
    );
  });

  it("ignores css and location lines in fallback event details", () => {
    const html = `
      <html>
        <body>
          <h1>SF SPCA Birthday Block Party</h1>
          <p>Saturday, April 18, 2026 12:00 pm to 5:00 pm</p>
          <p>Event Details</p>
          <p>.entry img.fc-img-auto-add { margin: 5px -3px; width: 563px; height: auto; }</p>
          <p>San Francisco SPCA, 201 Alabama St, San Francisco CA 94103</p>
          <p>Bring your dog and join the SF SPCA for an afternoon block party with food, activities, and live entertainment.</p>
          <p>Venue:</p>
          <p>San Francisco SPCA</p>
          <p>Address:</p>
          <p>201 Alabama St, San Francisco, CA 94103</p>
        </body>
      </html>
    `;

    assert.deepEqual(
      parseFuncheapEventPage(
        html,
        "https://sf.funcheap.com/sf-spca-birthday-block-party/",
      ),
      {
        title: "SF SPCA Birthday Block Party",
        location: "San Francisco SPCA, 201 Alabama St, San Francisco",
        date: "April 18, 2026",
        time: "12:00 PM – 5:00 PM",
        description:
          "Bring your dog and join the SF SPCA for an afternoon block party with food, activities, and live entertainment.",
        source_url: "https://sf.funcheap.com/sf-spca-birthday-block-party/",
      },
    );
  });

  it("moves a trailing title date range into the date field", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "http://schema.org",
          "@type": "Event",
          "name": "SF’s National Golden Gate Parks Earth Day + Spring &#8220;Days of Service&#8221; 2026 (April 18-26)",
          "description": "Volunteer events across the parks.",
          "startDate": "2026-04-18T09:00:00-07:00",
          "endDate": "2026-04-18T14:00:00-07:00",
          "location": {
            "@type": "Place",
            "name": "Golden Gate National Recreation Area",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "201 Fort Mason",
              "addressLocality": "San Francisco"
            }
          }
        }
      </script>
    `;

    assert.deepEqual(
      parseFuncheapEventPage(
        html,
        "https://sf.funcheap.com/sfs-national-golden-gate-parks-earth-day-spring-days-service-2026-april-1826/",
      ),
      {
        title: "SF’s National Golden Gate Parks Earth Day + Spring “Days of Service”",
        location: "Golden Gate National Recreation Area, 201 Fort Mason, San Francisco",
        date: "April 18–26, 2026",
        time: "9:00 AM – 2:00 PM",
        description: "Volunteer events across the parks.",
        source_url:
          "https://sf.funcheap.com/sfs-national-golden-gate-parks-earth-day-spring-days-service-2026-april-1826/",
      },
    );
  });
});
