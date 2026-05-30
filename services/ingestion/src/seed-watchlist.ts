/**
 * Seeds the `watchlist` table — the symbols the /pull/* endpoints track by
 * default. Run with `pnpm seed:watchlist [SYM ...]`; with no args it uses a
 * mega-cap tech starter set. Idempotent (onConflictDoNothing).
 */
import { db, getPool, dbSchema } from "@qt/shared";

const { watchlist } = dbSchema;

const DEFAULTS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA"];

async function main() {
  const symbols = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS).map((s) =>
    s.toUpperCase(),
  );
  const inserted = await db()
    .insert(watchlist)
    .values(symbols.map((symbol) => ({ symbol })))
    .onConflictDoNothing()
    .returning({ symbol: watchlist.symbol });
  await getPool().end();
  console.log(`watchlist seeded: ${inserted.length} new / ${symbols.length} requested`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
