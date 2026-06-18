/**
 * Applies the least-privilege role grants in scripts/db/grants.sql (Phase A RLS
 * hardening). Idempotent — run as the DB owner with `pnpm db:grants` after the
 * roles have been given LOGIN + PASSWORD out-of-band (see scripts/db/README.md).
 *
 * Separate from schema migrations on purpose: grants/roles aren't modeled by
 * Drizzle, so they live outside the migration chain and are re-applied on demand
 * (re-run after adding a new ROLE; new TABLES are covered by ALTER DEFAULT
 * PRIVILEGES in the SQL). The whole file is executed as one simple query, which
 * node-postgres runs as a multi-statement batch (no parameters → allowed).
 */
import { readFileSync } from "node:fs";
import { getPool } from "./client.js";

async function main() {
  // src/db/grants.ts → repo root → scripts/db/grants.sql
  const sqlPath = new URL("../../../../scripts/db/grants.sql", import.meta.url).pathname;
  const sql = readFileSync(sqlPath, "utf8");
  await getPool().query(sql);
  await getPool().end();
  console.log("grants applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
