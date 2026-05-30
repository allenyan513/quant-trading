/**
 * Applies generated SQL migrations from ./drizzle. Run with `pnpm db:migrate`
 * after `pnpm db:generate`.
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, getPool } from "./client.js";

async function main() {
  await migrate(db(), { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
  await getPool().end();
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
