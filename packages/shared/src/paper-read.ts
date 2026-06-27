/**
 * Per-user paper-trading account read — shared by the SPA dashboard route and the
 * MCP `get_paper_account` tool so both serve an identical shape from one source.
 * Driver-agnostic (injected PgDatabase, like `research.ts`). Read-only.
 *
 * A user with no account row yet reads as a virtual fresh account (starting cash,
 * no positions) so the UI shows it before the first trade. These tables are owned
 * by the portfolio service; this module only reads them.
 *
 * Orders are split by lifecycle: `workingOrders` are resting orders not yet filled —
 * limit orders, plus market orders queued while the market is closed (the cancellable
 * "Orders" view); `orders` is the terminal blotter (filled / rejected / cancelled —
 * the "Activity" history).
 */
import { and, desc, eq, ne } from "drizzle-orm";
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
  orderType: string; // market | limit
  quantity: number;
  limitPrice: number | null;
  tif: string; // day | gtc
  fillPrice: number | null;
  status: string; // working | filled | rejected | cancelled
  rejectReason: string | null;
  realizedPnl: number | null;
  thesis: string | null;
  targetPrice: number | null;
  stopPrice: number | null;
  timeHorizon: string | null;
  source: string;
  createdAt: Date;
  filledAt: Date | null;
  cancelledAt: Date | null;
}
export interface PaperAccount {
  cash: number;
  startingCash: number;
  realizedPnl: number;
  positions: PaperPositionRow[];
  workingOrders: PaperOrderRow[]; // resting limit + queued-market orders (cancellable)
  orders: PaperOrderRow[]; // terminal blotter (filled / rejected / cancelled)
}

const ORDER_COLS = {
  id: paperOrders.id,
  symbol: paperOrders.symbol,
  side: paperOrders.side,
  orderType: paperOrders.orderType,
  quantity: paperOrders.quantity,
  limitPrice: paperOrders.limitPrice,
  tif: paperOrders.tif,
  fillPrice: paperOrders.fillPrice,
  status: paperOrders.status,
  rejectReason: paperOrders.rejectReason,
  realizedPnl: paperOrders.realizedPnl,
  thesis: paperOrders.thesis,
  targetPrice: paperOrders.targetPrice,
  stopPrice: paperOrders.stopPrice,
  timeHorizon: paperOrders.timeHorizon,
  source: paperOrders.source,
  createdAt: paperOrders.createdAt,
  filledAt: paperOrders.filledAt,
  cancelledAt: paperOrders.cancelledAt,
} as const;

/** Read a user's paper account: cash + cumulative realized P&L, net positions, the
 *  resting working orders, and the most recent terminal blotter rows (default 50).
 *  Never throws on a missing account. */
export async function getPaperAccount(db: PaperDb, userId: string, opts: { ordersLimit?: number } = {}): Promise<PaperAccount> {
  const ordersLimit = Math.min(Math.max(opts.ordersLimit ?? 50, 1), 200);
  const [acctRows, posRows, workingRows, orderRows] = await Promise.all([
    db.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1),
    db
      .select({ symbol: paperPositions.symbol, quantity: paperPositions.quantity, avgCost: paperPositions.avgCost })
      .from(paperPositions)
      .where(eq(paperPositions.userId, userId)),
    db
      .select(ORDER_COLS)
      .from(paperOrders)
      .where(and(eq(paperOrders.userId, userId), eq(paperOrders.status, "working")))
      .orderBy(desc(paperOrders.createdAt)),
    db
      .select(ORDER_COLS)
      .from(paperOrders)
      .where(and(eq(paperOrders.userId, userId), ne(paperOrders.status, "working")))
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
    workingOrders: workingRows,
    orders: orderRows,
  };
}
