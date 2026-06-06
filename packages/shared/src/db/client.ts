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
      // Serverless (Cloud Run + Neon) resilience: TCP keepalive detects dead
      // sockets, and a short idle timeout retires pooled connections before
      // Neon's pooler / a CPU-throttled instance silently kills them — which
      // otherwise surfaces as "Connection terminated unexpectedly" on the next
      // query (esp. background work running after the HTTP response returned).
      keepAlive: true,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    // pg emits 'error' on an IDLE client whose connection drops. With no
    // listener Node treats it as unhandled and crashes the process. Swallow it
    // (console, not the logger — avoids a log -> sink -> client import cycle);
    // the pool discards the bad client and the next query gets a fresh one.
    _pool.on("error", (err) => {
      console.error("[db pool] idle client error (recovered):", err instanceof Error ? err.message : String(err));
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
