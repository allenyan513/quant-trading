/**
 * Read-only DB client for the API gateway.
 *
 * Moved from `services/web/lib/db.ts` — the read layer it backs (`./queries/*`
 * plus the injected `@qt/shared/research` helpers) already targets this client,
 * so it migrates with zero rewrite. Reuses the canonical Drizzle schema from
 * @qt/shared (single source of truth) but keeps its own neon-http client: a
 * stateless read-through HTTP client fits a gateway better than a long-lived pg
 * Pool. Point DATABASE_URL at a READ-ONLY Neon role.
 *
 * NOTE (deliberate divergence from services.md "use the shared db()"): the other
 * Hono services own writes and use the shared pg Pool; the gateway is read-only,
 * so it keeps web's neon-http client instead. Better Auth's transactional Pool
 * arrives as a SEPARATE client in PR2.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { schema } from "@qt/shared/db";
import { config } from "@qt/shared";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (!_db) {
    _db = drizzle(neon(config.databaseUrl()), { schema });
  }
  return _db;
}

// Table objects the dashboard reads, for convenient imports.
export const {
  universe,
  companyProfile,
  watchlist,
  watchlistLists,
  candidates,
  dailyPrices,
  quotes,
  incomeStatement,
  balanceSheet,
  cashFlow,
  financialRatios,
  analystEstimates,
  ratings,
  priceTargets,
  dividends,
  earningsCalendar,
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
