/**
 * Read-only DB client for the dashboard.
 *
 * Reuses the canonical Drizzle schema from @qt/shared (single source of truth)
 * but creates its own neon-http client — better suited to serverless / Vercel
 * than a long-lived pg Pool. Point DATABASE_URL at a READ-ONLY Neon role.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { schema } from "@qt/shared/db";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Missing required env var: DATABASE_URL");
    _db = drizzle(neon(url), { schema });
  }
  return _db;
}

// Table objects the dashboard reads, for convenient imports.
export const {
  universe,
  watchlist,
  candidates,
  dailyPrices,
  incomeStatement,
  balanceSheet,
  cashFlow,
  financialRatios,
  analystEstimates,
  valuationSnapshots,
  events,
  notifications,
  newsItems,
  tradingSignals,
  signalDeliveries,
  positions,
  logs,
} = schema;
