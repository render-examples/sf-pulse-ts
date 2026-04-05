/**
 * Minimal migration runner.
 *
 * Migrations live in /migrations as plain SQL files named:
 *   0001_description.sql
 *   0002_description.sql
 *   ...
 *
 * Applied migrations are tracked in the `schema_migrations` table.
 * Running migrate() is idempotent — already-applied versions are skipped.
 */
import { readdir, readFile } from "fs/promises";
import path from "path";
import { pool } from "./db.js";

// Works in both ESM (import.meta.url) and CJS bundles (__dirname)
const MIGRATIONS_DIR = path.resolve(
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(new URL(import.meta.url).pathname),
  "../migrations"
);

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedVersions(): Promise<Set<string>> {
  const { rows } = await pool.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  return new Set(rows.map((r) => r.version));
}

export async function migrate(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedVersions();

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) {
      continue;
    }

    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [version]
      );
      await client.query("COMMIT");
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`[migrate] failed on ${file}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}
