/**
 * Per-user paper-trading engine — the portfolio service owns these writes.
 *
 * v1: MARKET orders, LONG equity, cash-accounted, filled at the current live quote.
 * A buy/sell updates a net position + cash atomically and records a blotter row for
 * every fill or rejection. Short selling, options, limit/stop orders, and automation
 * are deferred (the schema leaves room).
 *
 * Integrity: the fill price is fetched from the live-quote read-through BEFORE the
 * DB transaction (it may hit FMP) and is server-authoritative — a caller-supplied
 * price is never trusted (this is the order path the MCP `place_paper_order` tool
 * forwards to). Cash/position/blotter mutate inside one transaction.
 */
import { and, eq } from "drizzle-orm";
import { db, dbSchema, config, marketdata } from "@qt/shared";
import { log } from "./log.js";

const { paperAccounts, paperOrders, paperPositions } = dbSchema;
const EPS = 1e-9; // float tolerance for money/share comparisons

export type OrderSide = "buy" | "sell";
export type OrderSource = "manual" | "mcp";

export interface PaperOrderResult {
  orderId: string;
  status: "filled" | "rejected";
  symbol: string;
  side: OrderSide;
  quantity: number;
  fillPrice: number | null;
  rejectReason: string | null; // no_price | bad_quantity | insufficient_funds | insufficient_shares
  realizedPnl: number | null; // sells only
  cash: number; // account cash after the order
  position: { symbol: string; quantity: number; avgCost: number } | null; // resulting net position (null if flat)
}

/** Place a market order against the user's paper account. Always resolves with a
 *  result (rejections are recorded, not thrown). Idempotent on (userId, key). */
export async function createPaperOrder(
  userId: string,
  symbolRaw: string,
  side: OrderSide,
  quantity: number,
  source: OrderSource,
  idempotencyKey?: string | null,
): Promise<PaperOrderResult> {
  const symbol = symbolRaw.toUpperCase();

  // Idempotency: a retried submission with the same key returns the original order.
  if (idempotencyKey) {
    const prior = await db()
      .select()
      .from(paperOrders)
      .where(and(eq(paperOrders.userId, userId), eq(paperOrders.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (prior[0]) return replay(userId, prior[0]);
  }

  // Fill price first (may hit FMP) — outside the tx, server-authoritative.
  const quote = await marketdata.getLiveQuote(symbol);
  const price = quote?.price ?? null;

  const result = await db().transaction(async (tx) => {
    // Lazy-create the account, then read current cash / cumulative realized.
    const startingCash = config.paperStartingCash();
    await tx.insert(paperAccounts).values({ userId, cash: startingCash, startingCash }).onConflictDoNothing({ target: paperAccounts.userId });
    const [acct] = await tx
      .select({ cash: paperAccounts.cash, realizedPnl: paperAccounts.realizedPnl })
      .from(paperAccounts)
      .where(eq(paperAccounts.userId, userId))
      .limit(1);
    const cash0 = acct?.cash ?? startingCash;
    const realized0 = acct?.realizedPnl ?? 0;

    const [pos] = await tx
      .select()
      .from(paperPositions)
      .where(and(eq(paperPositions.userId, userId), eq(paperPositions.symbol, symbol)))
      .limit(1);
    const held = pos?.quantity ?? 0;
    const avg = pos?.avgCost ?? 0;
    const now = new Date();

    const writeOrder = async (o: {
      status: "filled" | "rejected";
      fillPrice: number | null;
      rejectReason: string | null;
      realizedPnl: number | null;
    }): Promise<string> => {
      const [row] = await tx
        .insert(paperOrders)
        .values({
          userId,
          symbol,
          side,
          quantity,
          fillPrice: o.fillPrice,
          status: o.status,
          rejectReason: o.rejectReason,
          realizedPnl: o.realizedPnl,
          source,
          idempotencyKey: idempotencyKey ?? null,
        })
        .returning({ id: paperOrders.id });
      return row!.id;
    };

    // Validation (no state change on reject).
    const rejectReason =
      price == null
        ? "no_price"
        : !(quantity > 0)
          ? "bad_quantity"
          : side === "buy" && quantity * price > cash0 + EPS
            ? "insufficient_funds"
            : side === "sell" && quantity > held + EPS
              ? "insufficient_shares" // no short selling in v1
              : null;

    if (rejectReason) {
      const orderId = await writeOrder({ status: "rejected", fillPrice: price, rejectReason, realizedPnl: null });
      return {
        orderId,
        status: "rejected" as const,
        symbol,
        side,
        quantity,
        fillPrice: price,
        rejectReason,
        realizedPnl: null,
        cash: cash0,
        position: pos ? { symbol, quantity: held, avgCost: avg } : null,
      };
    }

    const p = price as number; // non-null past the guard
    if (side === "buy") {
      const cost = quantity * p;
      const newQty = held + quantity;
      const newAvg = held > EPS ? (avg * held + cost) / newQty : p; // weighted average cost
      await tx
        .insert(paperPositions)
        .values({ userId, symbol, quantity: newQty, avgCost: newAvg, updatedAt: now })
        .onConflictDoUpdate({ target: [paperPositions.userId, paperPositions.symbol], set: { quantity: newQty, avgCost: newAvg, updatedAt: now } });
      const cash1 = cash0 - cost;
      await tx.update(paperAccounts).set({ cash: cash1, updatedAt: now }).where(eq(paperAccounts.userId, userId));
      const orderId = await writeOrder({ status: "filled", fillPrice: p, rejectReason: null, realizedPnl: null });
      return { orderId, status: "filled" as const, symbol, side, quantity, fillPrice: p, rejectReason: null, realizedPnl: null, cash: cash1, position: { symbol, quantity: newQty, avgCost: newAvg } };
    }

    // sell — close/reduce a long; cost basis (avg) unchanged on the remainder.
    const proceeds = quantity * p;
    const realized = (p - avg) * quantity;
    const newQty = held - quantity;
    if (newQty <= EPS) {
      await tx.delete(paperPositions).where(and(eq(paperPositions.userId, userId), eq(paperPositions.symbol, symbol)));
    } else {
      await tx.update(paperPositions).set({ quantity: newQty, updatedAt: now }).where(and(eq(paperPositions.userId, userId), eq(paperPositions.symbol, symbol)));
    }
    const cash1 = cash0 + proceeds;
    await tx.update(paperAccounts).set({ cash: cash1, realizedPnl: realized0 + realized, updatedAt: now }).where(eq(paperAccounts.userId, userId));
    const orderId = await writeOrder({ status: "filled", fillPrice: p, rejectReason: null, realizedPnl: realized });
    return { orderId, status: "filled" as const, symbol, side, quantity, fillPrice: p, rejectReason: null, realizedPnl: realized, cash: cash1, position: newQty > EPS ? { symbol, quantity: newQty, avgCost: avg } : null };
  });

  log.info("paper.order", {
    userId,
    symbol,
    side,
    quantity,
    status: result.status,
    fill_price: result.fillPrice,
    reject: result.rejectReason,
    source,
  });
  return result;
}

/** Reconstruct a result for an idempotent replay: the stored order + current account/position. */
async function replay(userId: string, o: typeof paperOrders.$inferSelect): Promise<PaperOrderResult> {
  const [acct] = await db().select({ cash: paperAccounts.cash }).from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1);
  const [pos] = await db()
    .select()
    .from(paperPositions)
    .where(and(eq(paperPositions.userId, userId), eq(paperPositions.symbol, o.symbol)))
    .limit(1);
  return {
    orderId: o.id,
    status: o.status as "filled" | "rejected",
    symbol: o.symbol,
    side: o.side as OrderSide,
    quantity: o.quantity,
    fillPrice: o.fillPrice,
    rejectReason: o.rejectReason,
    realizedPnl: o.realizedPnl,
    cash: acct?.cash ?? config.paperStartingCash(),
    position: pos ? { symbol: pos.symbol, quantity: pos.quantity, avgCost: pos.avgCost } : null,
  };
}

/** Wipe a user's paper positions + blotter and restore starting cash. */
export async function resetPaperAccount(userId: string): Promise<{ cash: number; realizedPnl: number }> {
  const startingCash = config.paperStartingCash();
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx.delete(paperPositions).where(eq(paperPositions.userId, userId));
    await tx.delete(paperOrders).where(eq(paperOrders.userId, userId));
    await tx
      .insert(paperAccounts)
      .values({ userId, cash: startingCash, startingCash, realizedPnl: 0, updatedAt: now })
      .onConflictDoUpdate({ target: paperAccounts.userId, set: { cash: startingCash, startingCash, realizedPnl: 0, updatedAt: now } });
  });
  log.info("paper.reset", { userId, starting_cash: startingCash });
  return { cash: startingCash, realizedPnl: 0 };
}
