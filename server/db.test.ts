/**
 * Tests for server/db.ts
 *
 * The module uses a lazy-init proxy so it can be imported without DATABASE_URL.
 * These tests verify that contract.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

describe("db lazy pool", () => {
  let savedUrl: string | undefined;

  before(() => {
    savedUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  after(() => {
    if (savedUrl !== undefined) {
      process.env.DATABASE_URL = savedUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("importing db.ts does not throw even without DATABASE_URL", async () => {
    // If the module is already cached this is a no-op, which still proves
    // it didn't throw on first import.
    await assert.doesNotReject(() => import("./db.js"));
  });

  it("getPool() throws synchronously when DATABASE_URL is absent", async () => {
    const { getPool } = await import("./db.js");
    assert.throws(
      () => getPool(),
      /DATABASE_URL is required/
    );
  });

  it("pool proxy throws when a method is accessed without DATABASE_URL", async () => {
    const { pool } = await import("./db.js");
    // The proxy getter calls getPool() synchronously — it throws before any
    // promise is created, so assert.throws (not rejects) is correct here.
    assert.throws(
      () => (pool as unknown as { query: unknown }).query,
      /DATABASE_URL is required/
    );
  });
});
