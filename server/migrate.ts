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
 *
 * Accepts an optional Pool so tests can inject pg-mem without touching
 * the real DATABASE_URL.
 */
import { readdir, readFile } from "fs/promises";
import path from "path";
import type { Pool } from "pg";

// Bundled CJS uses __dirname from dist/, while source ESM runs from the repo cwd.
export const MIGRATIONS_DIR = path.resolve(
  typeof __dirname !== "undefined" ? __dirname : process.cwd(),
  typeof __dirname !== "undefined" ? "../migrations" : "migrations",
);

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedVersions(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  return new Set(rows.map((r) => r.version));
}

export async function migrate(pool?: Pool, migrationsDir?: string): Promise<void> {
  // Lazy-import the real pool only when not injected, so tests never need
  // DATABASE_URL set.
  const p: Pool = pool ?? (await import("./db.js")).pool;
  const dir = migrationsDir ?? MIGRATIONS_DIR;

  await ensureMigrationsTable(p);
  const applied = await appliedVersions(p);

  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) {
      continue;
    }

    const sql = await readFile(path.join(dir, file), "utf-8");
    const client = await p.connect();
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
