import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDate } from "./dates.js";

describe("parseDate()", () => {
  it("parses a month+year string", () => {
    const d = parseDate("March 2026")!;
    assert.equal(d.getUTCFullYear(), 2026);
    assert.equal(d.getUTCMonth(), 2); // March = 2
    assert.equal(d.getUTCDate(), 1);
  });

  it("parses a full date string", () => {
    const d = parseDate("February 16, 2026")!;
    assert.equal(d.getUTCFullYear(), 2026);
    assert.equal(d.getUTCMonth(), 1);
    assert.equal(d.getUTCDate(), 16);
  });

  it("parses a date range — uses the first day", () => {
    const d = parseDate("May 23–24, 2026")!;
    assert.equal(d.getUTCMonth(), 4); // May = 4
    assert.equal(d.getUTCDate(), 23);
  });

  it("parses Spring as April", () => {
    const d = parseDate("Spring 2026 (upcoming)")!;
    assert.equal(d.getUTCMonth(), 3); // April
  });

  it("parses Summer as July", () => {
    const d = parseDate("Summer 2026")!;
    assert.equal(d.getUTCMonth(), 6);
  });

  it("parses Fall as October", () => {
    const d = parseDate("Fall 2026")!;
    assert.equal(d.getUTCMonth(), 9);
  });

  it("returns null when no year is present", () => {
    assert.equal(parseDate("sometime"), null);
  });

  it("defaults to day 1 when no day is given", () => {
    const d = parseDate("August 2025")!;
    assert.equal(d.getUTCDate(), 1);
  });

  it("handles April 1, 2026", () => {
    const d = parseDate("April 1, 2026")!;
    assert.equal(d.getUTCMonth(), 3);
    assert.equal(d.getUTCDate(), 1);
  });
});
