import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline } from "./timeline.js";

describe("buildTimeline()", () => {
  const reference = new Date(Date.UTC(2026, 3, 5));

  it("keeps month-only current-month items below the Today divider", () => {
    const items = [
      { name: "Past", date: "April 1, 2026" },
      { name: "Month Only", date: "April 2026" },
      { name: "Future", date: "May 2026" },
    ];

    const rows = buildTimeline(items, (item) => item.date, reference);
    const labels = rows.map((row) => (row.kind === "today" ? "Today" : row.item.name));

    assert.deepEqual(labels, ["Past", "Today", "Month Only", "Future"]);
  });

  it("places exact same-day dates below the Today divider", () => {
    const items = [
      { name: "Yesterday", date: "April 4, 2026" },
      { name: "Today Exact", date: "April 5, 2026" },
    ];

    const rows = buildTimeline(items, (item) => item.date, reference);
    const labels = rows.map((row) => (row.kind === "today" ? "Today" : row.item.name));

    assert.deepEqual(labels, ["Yesterday", "Today", "Today Exact"]);
  });

  it("keeps explicit upcoming dates below the Today divider", () => {
    const items = [
      { name: "Past", date: "March 2026" },
      { name: "Upcoming", date: "Spring 2026 (upcoming)" },
    ];

    const rows = buildTimeline(items, (item) => item.date, reference);
    const labels = rows.map((row) => (row.kind === "today" ? "Today" : row.item.name));

    assert.deepEqual(labels, ["Past", "Today", "Upcoming"]);
  });
});
