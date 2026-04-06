/**
 * Shared test utilities. Not part of the production bundle.
 *
 * createTestDb() returns a fresh pg-mem Pool with the full schema applied.
 * Call once per describe block (or per test for full isolation).
 */
import { DataType, newDb } from "pg-mem";
import path from "path";
import { fileURLToPath } from "url";
import type { Pool as PgPool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

export async function createTestDb(): Promise<PgPool> {
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
  const pool = new Pool() as unknown as PgPool;
  const { migrate } = await import("./migrate.js");
  await migrate(pool, MIGRATIONS_DIR);
  return pool;
}
