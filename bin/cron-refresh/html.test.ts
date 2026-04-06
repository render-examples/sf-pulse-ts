import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripHtml } from "../cron-refresh.js";

describe("stripHtml()", () => {
  it("removes HTML tags", () => {
    const result = stripHtml("<p>Hello <b>world</b></p>");
    assert.ok(!result.includes("<"));
    assert.ok(result.includes("Hello"));
    assert.ok(result.includes("world"));
  });

  it("collapses whitespace", () => {
    const result = stripHtml("  foo   <br/>   bar  ");
    assert.ok(!result.includes("  "));
  });

  it("truncates to 8000 characters", () => {
    const result = stripHtml("a".repeat(10000));
    assert.ok(result.length <= 8000);
  });

  it("returns empty string for empty input", () => {
    assert.equal(stripHtml(""), "");
  });
});
