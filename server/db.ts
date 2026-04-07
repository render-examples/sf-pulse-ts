import pg from "pg";

const { Pool } = pg;

// Defer the DATABASE_URL check to first use so that test files can import
// storage/routes modules without DATABASE_URL set (they inject a pg-mem pool).
let _pool: InstanceType<typeof Pool> | undefined;

export function getPool(): InstanceType<typeof Pool> {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required");
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

// Convenience proxy — reads like a real Pool but initialises lazily.
export const pool = new Proxy({} as InstanceType<typeof Pool>, {
  get(_target, prop) {
    return (getPool() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | undefined> {
  const result = await pool.query(sql, params);
  return result.rows[0] as T | undefined;
}

export async function execute(sql: string, params?: unknown[]): Promise<void> {
  await pool.query(sql, params);
}
