/**
 * Symbol search for the global command palette — match the universe by ticker or
 * company name. Read-only, Node runtime only.
 */
import { ilike, or, sql } from "drizzle-orm";
import { db, universe } from "../db.js";

export interface SymbolHit {
  symbol: string;
  name: string | null;
  sector: string | null;
}

export async function searchSymbols(query: string, limit = 8): Promise<SymbolHit[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const prefix = `${q}%`;
  return db()
    .select({ symbol: universe.symbol, name: universe.name, sector: universe.sector })
    .from(universe)
    .where(or(ilike(universe.symbol, like), ilike(universe.name, like)))
    // Rank: exact ticker, then ticker-prefix, then the rest; alpha by symbol within.
    .orderBy(
      sql`case when ${universe.symbol} = ${q.toUpperCase()} then 0 when ${universe.symbol} ilike ${prefix} then 1 else 2 end, ${universe.symbol}`,
    )
    .limit(limit);
}
