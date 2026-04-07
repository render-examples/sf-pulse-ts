import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import type { Pool as PgPool } from "pg";

function freshPool(): PgPool {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PgPool;
}

describe("pg-mem patch regressions", () => {
  it("supports correlated NOT EXISTS predicates that reference outer columns inside functions", async () => {
    const pool = freshPool();
    await pool.query("CREATE TABLE restaurants (name TEXT NOT NULL)");
    await pool.query("INSERT INTO restaurants (name) VALUES ('Benu')");

    const { rows } = await pool.query<{ name: string }>(
      `SELECT seed.name
       FROM (VALUES ('Benu'), ('Quince')) AS seed(name)
       WHERE NOT EXISTS (
         SELECT 1
         FROM restaurants AS existing
         WHERE lower(existing.name) = lower(seed.name)
       )
       ORDER BY seed.name`,
    );

    assert.deepEqual(rows, [{ name: "Quince" }]);
  });

  it("supports non-recursive CTE column lists in select statements", async () => {
    const pool = freshPool();

    const { rows } = await pool.query<{ name: string }>(
      `WITH seed(name) AS (VALUES ('Benu'), ('Quince'))
       SELECT seed.name
       FROM seed
       ORDER BY seed.name`,
    );

    assert.deepEqual(rows, [{ name: "Benu" }, { name: "Quince" }]);
  });

  it("supports top-level WITH INSERT statements", async () => {
    const pool = freshPool();
    await pool.query("CREATE TABLE restaurants (name TEXT NOT NULL)");
    await pool.query("INSERT INTO restaurants (name) VALUES ('Benu')");

    await pool.query(
      `WITH seed(name) AS (VALUES ('Benu'), ('Quince'))
       INSERT INTO restaurants (name)
       SELECT seed.name
       FROM seed
       WHERE NOT EXISTS (
         SELECT 1
         FROM restaurants AS existing
         WHERE lower(existing.name) = lower(seed.name)
       )`,
    );

    const { rows } = await pool.query<{ name: string }>(
      "SELECT name FROM restaurants ORDER BY name",
    );
    assert.deepEqual(rows, [{ name: "Benu" }, { name: "Quince" }]);
  });

  it("supports top-level WITH UPDATE statements", async () => {
    const pool = freshPool();
    await pool.query("CREATE TABLE restaurants (name TEXT NOT NULL)");
    await pool.query("INSERT INTO restaurants (name) VALUES ('Benu')");

    await pool.query(
      `WITH seed(name) AS (VALUES ('Benu'))
       UPDATE restaurants
       SET name = 'Quince'
       WHERE name IN (SELECT name FROM seed)`,
    );

    const { rows } = await pool.query<{ name: string }>(
      "SELECT name FROM restaurants ORDER BY name",
    );
    assert.deepEqual(rows, [{ name: "Quince" }]);
  });

  it("supports btrim(text)", async () => {
    const pool = freshPool();
    const { rows } = await pool.query<{ value: string }>(
      "SELECT btrim('  Mission  ') AS value",
    );

    assert.deepEqual(rows, [{ value: "Mission" }]);
  });

  it("supports nullif(text, text)", async () => {
    const pool = freshPool();
    const { rows } = await pool.query<{ same: string | null; different: string }>(
      "SELECT nullif('Mission', 'Mission') AS same, nullif('Mission', 'Sunset') AS different",
    );

    assert.deepEqual(rows, [{ same: null, different: "Mission" }]);
  });

  it("supports ROW_NUMBER() OVER with PARTITION BY and ORDER BY", async () => {
    const pool = freshPool();
    await pool.query(`
      CREATE TABLE restaurants (
        id INT NOT NULL,
        name TEXT NOT NULL,
        highlight_kind TEXT NOT NULL,
        added_at TIMESTAMPTZ NOT NULL
      )
    `);
    await pool.query(`
      INSERT INTO restaurants (id, name, highlight_kind, added_at)
      VALUES
        (1, 'Benu', 'opening', '2026-04-01T00:00:00Z'),
        (2, 'Benu', 'michelin', '2026-04-02T00:00:00Z'),
        (3, 'Quince', 'opening', '2026-04-03T00:00:00Z')
    `);

    const { rows } = await pool.query<{ id: number; row_num: number }>(
      `WITH ranked AS (
         SELECT
           id,
           ROW_NUMBER() OVER (
             PARTITION BY lower(name)
             ORDER BY CASE WHEN highlight_kind = 'michelin' THEN 0 ELSE 1 END, added_at DESC, id DESC
           ) AS row_num
         FROM restaurants
       )
       SELECT id, row_num
       FROM ranked
       ORDER BY id`,
    );

    assert.deepEqual(rows, [
      { id: 1, row_num: 2 },
      { id: 2, row_num: 1 },
      { id: 3, row_num: 1 },
    ]);
  });
});
