/**
 * Drizzle client over node-postgres. Uses a Pool so two-phase transactions work
 * (neon-http would not support transactions). Neon's pooled connection string
 * works here unchanged, and so does plain Postgres for local runs.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import { config } from "../config.js";

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: config.databaseUrl(),
      max: 5,
      ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
    });
  }
  return _pool;
}

export function db() {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export type DB = ReturnType<typeof db>;
export { schema };
