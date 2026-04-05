/**
 * Tests for server/migrate.ts
 *
 * Uses pg-mem so no real DATABASE_URL is needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import path from "path";
import { fileURLToPath } from "url";
import type { Pool as PgPool } from "pg";
import { migrate, MIGRATIONS_DIR } from "./migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function freshPool(): PgPool {
  const { Pool } = newDb().adapters.createPg();
  return new Pool() as unknown as PgPool;
}

describe("migrate()", () => {
  it("applies 0001_initial migration and creates all four tables", async () => {
    const pool = freshPool();
    await migrate(pool, MIGRATIONS_DIR);

    for (const table of ["restaurants", "events", "push_subscriptions", "data_updates"]) {
      const { rows } = await pool.query(`SELECT 1 FROM ${table} LIMIT 1`);
      assert.ok(Array.isArray(rows), `table ${table} should exist`);
    }
  });

  it("seeds restaurants and events in the initial migration", async () => {
    const pool = freshPool();
    await migrate(pool, MIGRATIONS_DIR);

    const { rows: r } = await pool.query("SELECT COUNT(*)::int AS n FROM restaurants");
    assert.ok((r[0] as { n: number }).n > 0, "should have seeded restaurants");

    const { rows: e } = await pool.query("SELECT COUNT(*)::int AS n FROM events");
    assert.ok((e[0] as { n: number }).n > 0, "should have seeded events");
  });

  it("records the applied version in schema_migrations", async () => {
    const pool = freshPool();
    await migrate(pool, MIGRATIONS_DIR);

    const { rows } = await pool.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version"
    );
    assert.deepEqual(rows.map((r) => r.version), ["0001_initial", "0002_menu_dietary"]);
  });

  it("is idempotent — running twice skips already-applied migrations", async () => {
    const pool = freshPool();
    await migrate(pool, MIGRATIONS_DIR);
    await migrate(pool, MIGRATIONS_DIR);

    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM schema_migrations");
    assert.equal((rows[0] as { n: number }).n, 2);
  });

  it("rolls back on a failing migration and re-throws", async () => {
    const pool = freshPool();
    await migrate(pool, MIGRATIONS_DIR);

    const badDir = path.resolve(__dirname, "fixtures/bad-migration");
    await assert.rejects(
      () => migrate(pool, badDir),
      /failed on/
    );
  });
});
