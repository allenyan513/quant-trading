/**
 * Per-user paper-trading account read — shared by the web dashboard route and the
 * MCP `get_paper_account` tool so both serve an identical shape from one source.
 * Driver-agnostic (injected PgDatabase, like `research.ts`). Read-only.
 *
 * A user with no account row yet reads as a virtual fresh account (starting cash,
 * no positions) so the UI shows it before the first trade. These tables are owned
 * by the portfolio service; this module only reads them.
 */
import { desc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { paperAccounts, paperOrders, paperPositions } from "./db/schema.js";
import { config } from "./config.js";

export type PaperDb = PgDatabase<any, any, any>;

export interface PaperPositionRow {
  symbol: string;
  quantity: number;
  avgCost: number;
}
export interface PaperOrderRow {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  fillPrice: number | null;
  status: string;
  rejectReason: string | null;
  realizedPnl: number | null;
  source: string;
  createdAt: Date;
}
export interface PaperAccount {
  cash: number;
  startingCash: number;
  realizedPnl: number;
  positions: PaperPositionRow[];
  orders: PaperOrderRow[];
}

/** Read a user's paper account: cash + cumulative realized P&L, net positions, and
 *  the most recent blotter rows (default 50). Never throws on a missing account. */
export async function getPaperAccount(db: PaperDb, userId: string, opts: { ordersLimit?: number } = {}): Promise<PaperAccount> {
  const ordersLimit = Math.min(Math.max(opts.ordersLimit ?? 50, 1), 200);
  const [acctRows, posRows, orderRows] = await Promise.all([
    db.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1),
    db
      .select({ symbol: paperPositions.symbol, quantity: paperPositions.quantity, avgCost: paperPositions.avgCost })
      .from(paperPositions)
      .where(eq(paperPositions.userId, userId)),
    db
      .select({
        id: paperOrders.id,
        symbol: paperOrders.symbol,
        side: paperOrders.side,
        quantity: paperOrders.quantity,
        fillPrice: paperOrders.fillPrice,
        status: paperOrders.status,
        rejectReason: paperOrders.rejectReason,
        realizedPnl: paperOrders.realizedPnl,
        source: paperOrders.source,
        createdAt: paperOrders.createdAt,
      })
      .from(paperOrders)
      .where(eq(paperOrders.userId, userId))
      .orderBy(desc(paperOrders.createdAt))
      .limit(ordersLimit),
  ]);
  const acct = acctRows[0];
  const startingCash = config.paperStartingCash();
  return {
    cash: acct?.cash ?? startingCash,
    startingCash: acct?.startingCash ?? startingCash,
    realizedPnl: acct?.realizedPnl ?? 0,
    positions: posRows.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    orders: orderRows,
  };
}
