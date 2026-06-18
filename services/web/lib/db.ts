/**
 * Read-only DB client for the dashboard (+ the OAuth MCP read tools).
 *
 * Reuses the canonical Drizzle schema from @qt/shared (single source of truth)
 * but creates its own neon-http client. Connects via DATABASE_URL_WEB — the
 * least-privilege `qt_web_ro` role (SELECT only, cannot read the encrypted
 * `data_holdings_accounts.flex_token`, cannot write). Phase A RLS hardening:
 * this is the surface that takes user / MCP input, so it must not be the owner
 * role. Falls back to DATABASE_URL when DATABASE_URL_WEB is unset, so local dev
 * (single owner URL) works unchanged. Better Auth writes go through a separate
 * pool (lib/auth-server.ts) on a write role; business writes forward to the
 * data service (T12). See scripts/db/README.md for the role model.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { schema } from "@qt/shared/db";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Missing required env var: DATABASE_URL_WEB or DATABASE_URL");
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
  ratings,
  priceTargets,
  insiderTrades,
  valuationSnapshots,
  morningBriefs,
  events,
  notifications,
  newsItems,
  tradingSignals,
  signalDeliveries,
  positions,
  holdingsAccounts,
  holdingsNavHistory,
  holdingsTrades,
  holdingsPositions,
  oauthAccessToken,
  thirteenFFilers,
  thirteenFHoldings,
  thirteenFCusipMap,
  logs,
} = schema;
