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
  db.public.registerFunction({
    name: "make_date",
    args: [DataType.integer, DataType.integer, DataType.integer],
    returns: DataType.date,
    implementation: (year: number, month: number, day: number) =>
      new Date(Date.UTC(year, month - 1, day)),
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
      "0007_structured_dates_and_event_dedupe",
      "0008_restaurant_identity_and_visibility",
      "0009_backfill_structured_dates",
    ]);
  });

  it("is idempotent — running twice skips already-applied migrations", async () => {
    const pool = freshPool();
    await migrate(pool, MIGRATIONS_DIR);
    await migrate(pool, MIGRATIONS_DIR);

    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM schema_migrations");
    assert.equal((rows[0] as { n: number }).n, 9);
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

  it("0007 adds structured date columns and backfills event dedupe keys", async () => {
    const pool = freshPool();
    const baseDir = await migrationDirWith([
      "0001_initial.sql",
      "0002_menu_dietary.sql",
      "0003_escape_event_titles.sql",
      "0004_restaurant_highlights_and_cron_runs.sql",
      "0005_backfill_sf_michelin_stars.sql",
      "0006_add_hot_path_indexes.sql",
    ]);
    const structuredDir = await migrationDirWith([
      "0007_structured_dates_and_event_dedupe.sql",
    ]);

    await migrate(pool, baseDir);
    await migrate(pool, structuredDir);
    await migrate(pool, structuredDir);

    const {
      rows: [restaurant],
    } = await pool.query<{
      opened_start_date: string | null;
      opened_end_date: string | null;
      opened_date_precision: string;
      is_upcoming: boolean;
    }>(
      `SELECT opened_start_date, opened_end_date, opened_date_precision, is_upcoming
       FROM restaurants
       WHERE name = 'Maillards'`,
    );
    assert.deepEqual(restaurant, {
      opened_start_date: null,
      opened_end_date: null,
      opened_date_precision: "unknown",
      is_upcoming: false,
    });

    const {
      rows: [event],
    } = await pool.query<{
      start_date: string | null;
      end_date: string | null;
      date_precision: string;
      dedupe_key: string;
    }>(
      `SELECT start_date, end_date, date_precision, dedupe_key
       FROM events
       WHERE title = 'San Francisco Carnaval Festival &amp; Parade'`,
    );
    assert.deepEqual(event, {
      start_date: null,
      end_date: null,
      date_precision: "unknown",
      dedupe_key:
        "san francisco carnaval festival &amp; parade|mission district (harrison st, 17 blocks)|may 23–24, 2026",
    });

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO events (title, location, date, dedupe_key)
           VALUES ('San Francisco Carnaval Festival &amp; Parade', 'Mission District (Harrison St, 17 blocks)', 'May 23–24, 2026', 'san francisco carnaval festival &amp; parade|mission district (harrison st, 17 blocks)|may 23–24, 2026')`,
        ),
      /duplicate|unique/i,
    );
  });

  it("0008 backfills restaurant identity, keeps the Michelin duplicate, and enforces uniqueness", async () => {
    const pool = freshPool();
    const baseDir = await migrationDirWith([
      "0001_initial.sql",
      "0002_menu_dietary.sql",
      "0003_escape_event_titles.sql",
      "0004_restaurant_highlights_and_cron_runs.sql",
      "0005_backfill_sf_michelin_stars.sql",
      "0006_add_hot_path_indexes.sql",
      "0007_structured_dates_and_event_dedupe.sql",
    ]);
    const identityDir = await migrationDirWith([
      "0008_restaurant_identity_and_visibility.sql",
    ]);

    await migrate(pool, baseDir);
    await pool.query(
      `INSERT INTO restaurants (name, neighborhood, cuisine, address, opened_date, source_url, highlight_kind)
       VALUES
         ('Twin Peaks', 'Mission', 'New opening', '1 Castro St', 'April 2026', NULL, 'opening'),
         ('Twin Peaks', 'Mission', 'Michelin 1-star recognition', '1 Castro St', '1 star · June 27, 2025', 'https://example.com/michelin', 'michelin')`,
    );

    await migrate(pool, identityDir);
    await migrate(pool, identityDir);

    const { rows } = await pool.query<{
      name: string;
      cuisine: string;
      identity_key: string;
      highlight_kind: string;
    }>(
      `SELECT name, cuisine, identity_key, highlight_kind
       FROM restaurants
       WHERE name = 'Twin Peaks'`,
    );

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      name: "Twin Peaks",
      cuisine: "Michelin 1-star recognition",
      identity_key: "twin peaks|1 castro st",
      highlight_kind: "michelin",
    });

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO restaurants (
             name,
             neighborhood,
             cuisine,
             address,
             opened_date,
             source_url,
             highlight_kind,
             identity_key
           )
           VALUES (
             'Twin Peaks',
             'Mission',
             'Another copy',
             '1 Castro St',
             'April 2026',
             NULL,
             'opening',
             'twin peaks|1 castro st'
           )`,
        ),
      /duplicate|unique/i,
    );
  });

  it("0009 backfills missing structured dates for legacy restaurants and events", async () => {
    const pool = freshPool();
    const baseDir = await migrationDirWith([
      "0001_initial.sql",
      "0002_menu_dietary.sql",
      "0003_escape_event_titles.sql",
      "0004_restaurant_highlights_and_cron_runs.sql",
      "0005_backfill_sf_michelin_stars.sql",
      "0006_add_hot_path_indexes.sql",
      "0007_structured_dates_and_event_dedupe.sql",
      "0008_restaurant_identity_and_visibility.sql",
    ]);
    const backfillDir = await migrationDirWith([
      "0009_backfill_structured_dates.sql",
    ]);

    await migrate(pool, baseDir);
    await migrate(pool, backfillDir);
    await migrate(pool, backfillDir);

    const {
      rows: [restaurant],
    } = await pool.query<{
      opened_start_date: string | null;
      opened_end_date: string | null;
      opened_date_precision: string;
      is_upcoming: boolean;
    }>(
      `SELECT opened_start_date::text AS opened_start_date,
              opened_end_date::text AS opened_end_date,
              opened_date_precision,
              is_upcoming
       FROM restaurants
       WHERE name = 'Maillards'`,
    );
    assert.deepEqual(restaurant, {
      opened_start_date: "2026-07-01",
      opened_end_date: "2026-09-30",
      opened_date_precision: "season",
      is_upcoming: true,
    });

    const {
      rows: [michelinRestaurant],
    } = await pool.query<{
      opened_start_date: string | null;
      opened_end_date: string | null;
      opened_date_precision: string;
    }>(
      `SELECT opened_start_date::text AS opened_start_date,
              opened_end_date::text AS opened_end_date,
              opened_date_precision
       FROM restaurants
       WHERE name = 'Benu'`,
    );
    assert.deepEqual(michelinRestaurant, {
      opened_start_date: "2025-06-27",
      opened_end_date: "2025-06-27",
      opened_date_precision: "day",
    });

    const {
      rows: [event],
    } = await pool.query<{
      start_date: string | null;
      end_date: string | null;
      date_precision: string;
      is_upcoming: boolean;
    }>(
      `SELECT start_date::text AS start_date,
              end_date::text AS end_date,
              date_precision,
              is_upcoming
       FROM events
       WHERE title = 'San Francisco Carnaval Festival &amp; Parade'`,
    );
    assert.deepEqual(event, {
      start_date: "2026-05-23",
      end_date: "2026-05-24",
      date_precision: "day_range",
      is_upcoming: true,
    });
  });
});
