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
});
