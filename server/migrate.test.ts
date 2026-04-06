/**
 * Tests for server/migrate.ts
 *
 * Uses pg-mem so no real DATABASE_URL is needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DataType, newDb } from "pg-mem";
import { copyFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "url";
import type { Pool as PgPool } from "pg";
import { migrate, MIGRATIONS_DIR } from "./migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function freshPool(): PgPool {
  const db = newDb();
  db.public.registerFunction({
    name: "replace",
    args: [DataType.text, DataType.text, DataType.text],
    returns: DataType.text,
    implementation: (
      value: string,
      search: string,
      replacement: string,
    ) => value.split(search).join(replacement),
  });
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PgPool;
}

async function migrationDirWith(files: string[]): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sf-pulse-migrations-"));
  await Promise.all(
    files.map((file) =>
      copyFile(path.join(MIGRATIONS_DIR, file), path.join(dir, file)),
    ),
  );
  return dir;
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
    assert.deepEqual(rows.map((r) => r.version), [
      "0001_initial",
      "0002_menu_dietary",
      "0003_escape_event_titles",
      "0004_restaurant_highlights_and_cron_runs",
      "0005_backfill_sf_michelin_stars",
      "0006_add_hot_path_indexes",
    ]);
  });

  it("is idempotent — running twice skips already-applied migrations", async () => {
    const pool = freshPool();
    await migrate(pool, MIGRATIONS_DIR);
    await migrate(pool, MIGRATIONS_DIR);

    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM schema_migrations");
    assert.equal((rows[0] as { n: number }).n, 6);
  });

  it("seeds the current San Francisco Michelin-starred restaurants", async () => {
    const pool = freshPool();
    await migrate(pool, MIGRATIONS_DIR);

    const { rows: counts } = await pool.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM restaurants WHERE highlight_kind = 'michelin'",
    );
    assert.equal(counts[0]?.n, 26);

    const { rows } = await pool.query<{
      name: string;
      opened_date: string;
      source_url: string;
    }>(
      `SELECT name, opened_date, source_url
       FROM restaurants
       WHERE name IN ('Benu', 'Kiln', 'Nari')
       ORDER BY name`,
    );

    assert.deepEqual(rows, [
      {
        name: "Benu",
        opened_date: "3 stars · June 27, 2025",
        source_url: "https://guide.michelin.com/us/en/california/san-francisco/restaurant/benu",
      },
      {
        name: "Kiln",
        opened_date: "2 stars · June 27, 2025",
        source_url: "https://guide.michelin.com/us/en/california/san-francisco/restaurant/kiln-1210355",
      },
      {
        name: "Nari",
        opened_date: "1 star · June 27, 2025",
        source_url: "https://guide.michelin.com/us/en/california/san-francisco/restaurant/nari",
      },
    ]);
  });

  it("escapes seeded event titles that contain HTML-sensitive characters", async () => {
    const pool = freshPool();
    await migrate(pool, MIGRATIONS_DIR);

    const { rows } = await pool.query<{ title: string }>(
      "SELECT title FROM events WHERE title LIKE 'Easter in the Park%'"
    );
    assert.equal(
      rows[0]?.title,
      "Easter in the Park &amp; Hunky Jesus Contest"
    );
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

  it("0005 upgrades matching restaurants instead of inserting duplicates", async () => {
    const pool = freshPool();
    const baseDir = await migrationDirWith([
      "0001_initial.sql",
      "0002_menu_dietary.sql",
      "0003_escape_event_titles.sql",
      "0004_restaurant_highlights_and_cron_runs.sql",
    ]);
    const backfillDir = await migrationDirWith([
      "0005_backfill_sf_michelin_stars.sql",
    ]);

    await migrate(pool, baseDir);
    await pool.query(
      `INSERT INTO restaurants (name, neighborhood, cuisine, address, opened_date, source_url, highlight_kind)
       VALUES ('Benu', 'SoMa', 'New opening', NULL, 'April 2026', NULL, 'opening')`,
    );

    await migrate(pool, backfillDir);

    const { rows } = await pool.query<{
      name: string;
      highlight_kind: string;
      opened_date: string;
      source_url: string;
    }>(
      `SELECT name, highlight_kind, opened_date, source_url
       FROM restaurants
       WHERE lower(name) = lower('Benu')`,
    );

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      name: "Benu",
      highlight_kind: "michelin",
      opened_date: "3 stars · June 27, 2025",
      source_url: "https://guide.michelin.com/us/en/california/san-francisco/restaurant/benu",
    });
  });

  it("0006 applies cleanly on top of populated data without changing rows", async () => {
    const pool = freshPool();
    const baseDir = await migrationDirWith([
      "0001_initial.sql",
      "0002_menu_dietary.sql",
      "0003_escape_event_titles.sql",
      "0004_restaurant_highlights_and_cron_runs.sql",
      "0005_backfill_sf_michelin_stars.sql",
    ]);
    const indexDir = await migrationDirWith([
      "0006_add_hot_path_indexes.sql",
    ]);

    await migrate(pool, baseDir);
    const {
      rows: [restaurantCountBefore],
    } = await pool.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM restaurants",
    );
    await migrate(pool, indexDir);
    await migrate(pool, indexDir);

    const {
      rows: [restaurantCountAfter],
    } = await pool.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM restaurants",
    );
    const { rows } = await pool.query<{ version: string }>(
      `SELECT version
       FROM schema_migrations
       WHERE version = '0006_add_hot_path_indexes'`,
    );

    assert.equal(restaurantCountBefore?.n, restaurantCountAfter?.n);
    assert.deepEqual(rows, [{ version: "0006_add_hot_path_indexes" }]);
  });
});
