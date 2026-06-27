/**
 * Paper ledger — the per-user, order-driven paper-trading engine (portfolio owns these writes).
 *
 * Equity, cash-accounted, LONG or SHORT (signed net positions). Two order types:
 *  - MARKET: fills immediately at the current live quote — UNLESS that quote's exchange
 *            timestamp is stale (market not actively trading), in which case the order is
 *            QUEUED as `status='working'` (no fill at a stale price) and fills at the next
 *            fresh quote, i.e. the next open (mirrors a broker's market-on-open).
 *  - LIMIT:  rests as `status='working'` and fills when the live quote crosses the
 *            limit (buy: quote ≤ limit; sell: quote ≥ limit), at the crossing quote
 *            (which honors the limit as a bound and gives price improvement). Working orders
 *            are matched on demand (`matchWorkingOrders`, called when the user opens
 *            the paper page / reads the account) — there is no background cron.
 * Each order can carry a recorded thesis (rationale / target / stop / horizon) which
 * is informational only — never auto-executed.
 *
 * Integrity: a market fill price is fetched from the live-quote read-through BEFORE the
 * DB transaction (it may hit FMP) and is server-authoritative — a caller-supplied price
 * is never trusted. The validate-and-mutate core (`applyFill`) runs inside one tx that
 * row-locks the account so concurrent orders serialize instead of racing.
 *
 * A sell beyond a long (or from flat) opens a SHORT — bounded by buying power
 * (cash − 2·short collateral; no margin/borrow modeling). Options and partial fills
 * are deferred.
 */
import { and, eq } from "drizzle-orm";
import { db, dbSchema, config, marketdata, mapLimit } from "@qt/shared";
import { log } from "./log.js";

const { paperAccounts, paperOrders, paperPositions } = dbSchema;
const EPS = 1e-9; // float tolerance for money/share comparisons
const MATCH_CONCURRENCY = 8;

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type Tif = "day" | "gtc";
export type OrderSource = "manual" | "mcp";
export type OrderStatus = "filled" | "rejected" | "working" | "cancelled";

/** Resolved tx handle type (drizzle infers the transaction callback param). */
type DbTx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

interface PositionState {
  symbol: string;
  quantity: number;
  avgCost: number;
}

/** Recorded entry rationale + plan. Informational; never drives execution in v1. */
export interface ThesisInput {
  thesis?: string | null;
  targetPrice?: number | null;
  stopPrice?: number | null;
  timeHorizon?: string | null;
}

export interface PlacePaperOrderInput extends ThesisInput {
  userId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  source: OrderSource;
  orderType?: OrderType; // default "market"
  limitPrice?: number | null; // required for limit orders
  tif?: Tif; // default "gtc"
  idempotencyKey?: string | null;
}

export interface PaperOrderResult {
  orderId: string;
  status: OrderStatus;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  limitPrice: number | null;
  fillPrice: number | null;
  // no_price | bad_quantity | bad_limit_price | insufficient_buying_power | day_expired
  rejectReason: string | null;
  realizedPnl: number | null; // recognized on the closed portion (reduce/cover/flip)
  cash: number; // account cash after the order
  position: PositionState | null; // resulting net position for this symbol (null if flat)
}

interface FillOutcome {
  filled: boolean;
  rejectReason: string | null;
  fillPrice: number | null;
  realizedPnl: number | null;
  cash: number; // resulting cash (unchanged on reject)
  position: PositionState | null;
}

/** ET calendar day (yyyy-mm-dd, sortable) — used to expire `tif='day'` working orders. */
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export const etDay = (d: Date): string => ET_DAY.format(d);

/** Does a resting limit order fill at `price`? Buy fills at/below limit, sell at/above. */
export function limitCrosses(side: OrderSide, price: number, limit: number): boolean {
  return side === "buy" ? price <= limit : price >= limit;
}

/**
 * Is a quote too old to fill a MARKET order against? True when the exchange last-trade time
 * (`quoteTs`) is older than `maxStaleMs` — i.e. the market isn't actively trading (closed /
 * weekend / holiday / pre-open), so filling would lock in a stale, unobtainable price.
 * `quoteTs == null` (FMP omitted it) is treated as live (fail-open): we never gate on a
 * signal we don't have. This needs no trading calendar — a closed market freezes `quoteTs`.
 */
export function isQuoteStale(quoteTs: Date | null, now: Date, maxStaleMs: number): boolean {
  return quoteTs != null && now.getTime() - quoteTs.getTime() > maxStaleMs;
}

/** A `tif='day'` order is expired once `now` is on a later ET calendar day than it was placed. */
export function isDayExpired(tif: string, createdAt: Date, now: Date): boolean {
  return tif === "day" && etDay(createdAt) < etDay(now);
}

export interface FillMath {
  signedDelta: number; // +qty for a buy, −qty for a sell
  newQty: number; // resulting signed net position
  newAvg: number; // resulting average cost (positive)
  realized: number | null; // realized P&L on the closed portion, else null (pure open/add)
  increasingShares: number; // shares that grow exposure (drive the buying-power notional)
}

/**
 * Pure signed-position fill math (no DB / cash). `held` is the signed net position,
 * `avg` its positive average cost. A buy adds +qty, a sell −qty; a sell beyond a long
 * (or from flat) opens a short. Realized P&L is recognized on the closed shares; on a
 * flip the prior side is fully closed and the remainder opens at `price`.
 */
export function fillMath(held: number, avg: number, side: OrderSide, quantity: number, price: number): FillMath {
  const signedDelta = side === "buy" ? quantity : -quantity;
  const newQty = held + signedDelta;
  const absHeld = Math.abs(held);
  const sameDirOrFlat = held === 0 || Math.sign(signedDelta) === Math.sign(held);
  const increasingShares = sameDirOrFlat ? quantity : Math.max(0, quantity - absHeld);

  let realized: number | null = null;
  let newAvg: number;
  if (sameDirOrFlat) {
    // Open or add — weighted-average the absolute exposure (absHeld=0 → newAvg=price).
    newAvg = (avg * absHeld + price * quantity) / (absHeld + quantity);
  } else if (quantity <= absHeld + EPS) {
    // Reduce/close the open side; basis unchanged on the remainder.
    realized = Math.sign(held) * (price - avg) * quantity;
    newAvg = avg;
  } else {
    // Flip: realize the whole prior position, open the remainder at the fill price.
    realized = Math.sign(held) * (price - avg) * absHeld;
    newAvg = price;
  }
  return { signedDelta, newQty, newAvg, realized, increasingShares };
}

const pickThesis = (i: ThesisInput) => ({
  thesis: i.thesis ?? null,
  targetPrice: i.targetPrice ?? null,
  stopPrice: i.stopPrice ?? null,
  timeHorizon: i.timeHorizon ?? null,
});

/** Short collateral reserved against buying power = Σ |qty|·avgCost over the user's
 *  open SHORT positions (cost basis). Read inside the tx (the account row-lock above
 *  serializes a user's orders, so positions can't shift mid-order). */
async function sumShortCollateral(tx: DbTx, userId: string): Promise<number> {
  const rows = await tx.select({ quantity: paperPositions.quantity, avgCost: paperPositions.avgCost }).from(paperPositions).where(eq(paperPositions.userId, userId));
  return rows.reduce((s, r) => (r.quantity < 0 ? s + Math.abs(r.quantity) * r.avgCost : s), 0);
}

/**
 * Validate + apply a fill at `price` against the user's account/position, INSIDE `tx`.
 * Row-locks the account (so concurrent orders serialize instead of racing on `cash`)
 * and the position. Does NOT write the order row — the caller persists it (an INSERT
 * for a market order, an UPDATE of the working row for a matched limit order).
 *
 * SIGNED positions: `quantity` > 0 long, < 0 short; `avgCost` is the (positive) average
 * entry of whichever side is open. A buy adds +qty, a sell −qty, so a sell beyond a long
 * (or from flat) opens/extends a SHORT. Cash always moves by −Δ·price (buys debit, sells
 * — including short opens — credit). Realized P&L is recognized on the closed portion.
 *
 * Buying power = cash − 2·short collateral (no margin/borrow modeling — a deliberate v1
 * sim simplification). Only the position-INCREASING notional consumes it; a reduce/close
 * frees capital. Short-sale proceeds inflate cash but are locked AND require equal
 * collateral (the 2× factor), so each $1 of short notional costs $1 of buying power —
 * preventing unbounded shorts.
 */
async function applyFill(tx: DbTx, userId: string, symbol: string, side: OrderSide, quantity: number, price: number | null, now: Date): Promise<FillOutcome> {
  const startingCash = config.paperStartingCash();
  await tx.insert(paperAccounts).values({ userId, cash: startingCash, startingCash }).onConflictDoNothing({ target: paperAccounts.userId });
  const [acct] = await tx
    .select({ cash: paperAccounts.cash, realizedPnl: paperAccounts.realizedPnl })
    .from(paperAccounts)
    .where(eq(paperAccounts.userId, userId))
    .for("update")
    .limit(1);
  const cash0 = acct?.cash ?? startingCash;
  const realized0 = acct?.realizedPnl ?? 0;

  const [pos] = await tx
    .select()
    .from(paperPositions)
    .where(and(eq(paperPositions.userId, userId), eq(paperPositions.symbol, symbol)))
    .for("update")
    .limit(1);
  const held = pos?.quantity ?? 0;
  const avg = pos?.avgCost ?? 0;

  const reject = (reason: string): FillOutcome => ({ filled: false, rejectReason: reason, fillPrice: price, realizedPnl: null, cash: cash0, position: pos ? { symbol, quantity: held, avgCost: avg } : null });

  // Reject a missing OR non-positive price (a bad 0/negative quote would let you trade for free).
  if (price == null || price <= 0) return reject("no_price");
  if (!(quantity > 0)) return reject("bad_quantity");
  const p = price;

  const { signedDelta, newQty, newAvg, realized, increasingShares } = fillMath(held, avg, side, quantity, p);
  const cash1 = cash0 - signedDelta * p; // buys debit, sells (incl short opens) credit

  // Buying-power gate (only when the order GROWS exposure — a pure reduce/cover frees
  // capital and is never gated). Invariant kept ≥ 0 after the trade:
  //   buying power = cash − 2 · short collateral (cost basis of open shorts).
  // A short's sale proceeds land in cash but are LOCKED, and it also requires equal
  // collateral — so each $1 of short notional consumes $1 of buying power (subtracting
  // the collateral only once would let `cash − collateral` stay flat → unbounded shorts).
  // No margin/borrow modeling — a deliberate v1 sim simplification.
  const increasingNotional = increasingShares * p;
  if (increasingNotional > EPS) {
    const shortCollateralBefore = await sumShortCollateral(tx, userId);
    const deltaCollateral = (newQty < 0 ? Math.abs(newQty) * newAvg : 0) - (held < 0 ? Math.abs(held) * avg : 0);
    const shortCollateralAfter = shortCollateralBefore + deltaCollateral;
    if (cash1 - 2 * shortCollateralAfter < -EPS) return reject("insufficient_buying_power");
  }

  // Persist the net position (delete when flat), cash (−Δ·price), and realized.
  if (Math.abs(newQty) <= EPS) {
    await tx.delete(paperPositions).where(and(eq(paperPositions.userId, userId), eq(paperPositions.symbol, symbol)));
  } else {
    await tx
      .insert(paperPositions)
      .values({ userId, symbol, quantity: newQty, avgCost: newAvg, updatedAt: now })
      .onConflictDoUpdate({ target: [paperPositions.userId, paperPositions.symbol], set: { quantity: newQty, avgCost: newAvg, updatedAt: now } });
  }
  await tx.update(paperAccounts).set({ cash: cash1, realizedPnl: realized0 + (realized ?? 0), updatedAt: now }).where(eq(paperAccounts.userId, userId));
  return { filled: true, rejectReason: null, fillPrice: p, realizedPnl: realized, cash: cash1, position: Math.abs(newQty) > EPS ? { symbol, quantity: newQty, avgCost: newAvg } : null };
}

/**
 * Place a paper order against the user's account. Always resolves with a result
 * (rejections are recorded, not thrown). Idempotent on (userId, idempotencyKey).
 *
 * A MARKET order fills synchronously at the live quote. A LIMIT order is recorded as
 * `working` (no cash/position change) and fills later via `matchWorkingOrders`.
 */
export async function createPaperOrder(input: PlacePaperOrderInput): Promise<PaperOrderResult> {
  const userId = input.userId;
  const symbol = input.symbol.toUpperCase();
  const side = input.side;
  const quantity = input.quantity;
  const orderType: OrderType = input.orderType ?? "market";
  const tif: Tif = input.tif ?? "gtc";
  const limitPrice = input.limitPrice ?? null;
  const idempotencyKey = input.idempotencyKey ?? null;
  const thesis = pickThesis(input);

  // Idempotency: a retried submission with the same key returns the original order.
  if (idempotencyKey) {
    const prior = await db()
      .select()
      .from(paperOrders)
      .where(and(eq(paperOrders.userId, userId), eq(paperOrders.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (prior[0]) return await replay(userId, prior[0]);
  }

  if (orderType === "limit") return await placeLimitOrder({ userId, symbol, side, quantity, tif, limitPrice, idempotencyKey, source: input.source, thesis });

  // MARKET — fill price first (may hit FMP), server-authoritative, outside the tx.
  const quote = await marketdata.getLiveQuote(symbol);
  const price = quote?.price ?? null;
  const now = new Date();

  // Market not actively trading (stale exchange quote): QUEUE as a working market order
  // rather than fill at a stale, unobtainable price — it fills at the next fresh quote
  // (next open) via matchWorkingOrders. Only divert a well-formed order we have a price for;
  // a bad quantity / missing price still falls through to applyFill and rejects there.
  if (quantity > 0 && price != null && price > 0 && quote && isQuoteStale(quote.quoteTs, now, config.paperQuoteMaxStaleMs())) {
    return await queueMarketOrder({ userId, symbol, side, quantity, tif, idempotencyKey, source: input.source, thesis });
  }

  const result = await db().transaction(async (tx) => {
    const o = await applyFill(tx, userId, symbol, side, quantity, price, now);
    const [row] = await tx
      .insert(paperOrders)
      .values({
        userId,
        symbol,
        side,
        orderType: "market",
        quantity,
        fillPrice: o.fillPrice,
        status: o.filled ? "filled" : "rejected",
        rejectReason: o.rejectReason,
        realizedPnl: o.realizedPnl,
        ...thesis,
        source: input.source,
        idempotencyKey,
        filledAt: o.filled ? now : null,
      })
      .returning({ id: paperOrders.id });
    return toResult(row!.id, o.filled ? "filled" : "rejected", { symbol, side, orderType: "market", quantity, limitPrice: null }, o);
  });

  log.info("paper.order", { userId, symbol, side, order_type: "market", quantity, status: result.status, fill_price: result.fillPrice, reject: result.rejectReason, source: input.source });
  return result;
}

/** Record a resting limit order (`working`); no cash/position change until matched. */
async function placeLimitOrder(args: {
  userId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  tif: Tif;
  limitPrice: number | null;
  idempotencyKey: string | null;
  source: OrderSource;
  thesis: ReturnType<typeof pickThesis>;
}): Promise<PaperOrderResult> {
  const { userId, symbol, side, quantity, tif, limitPrice, idempotencyKey, source, thesis } = args;
  const rejectReason = !(quantity > 0) ? "bad_quantity" : limitPrice == null || limitPrice <= 0 ? "bad_limit_price" : null;
  const status: OrderStatus = rejectReason ? "rejected" : "working";

  const [row] = await db()
    .insert(paperOrders)
    .values({ userId, symbol, side, orderType: "limit", quantity, limitPrice, tif, status, rejectReason, ...thesis, source, idempotencyKey })
    .returning({ id: paperOrders.id });

  // A working order leaves the account untouched — surface the current cash/position.
  const [acct] = await db().select({ cash: paperAccounts.cash }).from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1);
  const [pos] = await db()
    .select()
    .from(paperPositions)
    .where(and(eq(paperPositions.userId, userId), eq(paperPositions.symbol, symbol)))
    .limit(1);
  log.info("paper.order", { userId, symbol, side, order_type: "limit", quantity, limit_price: limitPrice, status, reject: rejectReason, source });
  return {
    orderId: row!.id,
    status,
    symbol,
    side,
    orderType: "limit",
    quantity,
    limitPrice,
    fillPrice: null,
    rejectReason,
    realizedPnl: null,
    cash: acct?.cash ?? config.paperStartingCash(),
    position: pos ? { symbol: pos.symbol, quantity: pos.quantity, avgCost: pos.avgCost } : null,
  };
}

/** Record a MARKET order as `working` because the live quote is stale (market not trading).
 *  No cash/position change — `matchWorkingOrders` fills it at the next fresh quote (open).
 *  Carries no limit price; it's distinguished from a limit order by `orderType='market'`. */
async function queueMarketOrder(args: {
  userId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  tif: Tif;
  idempotencyKey: string | null;
  source: OrderSource;
  thesis: ReturnType<typeof pickThesis>;
}): Promise<PaperOrderResult> {
  const { userId, symbol, side, quantity, tif, idempotencyKey, source, thesis } = args;
  const [row] = await db()
    .insert(paperOrders)
    .values({ userId, symbol, side, orderType: "market", quantity, limitPrice: null, tif, status: "working", ...thesis, source, idempotencyKey })
    .returning({ id: paperOrders.id });

  // A queued order leaves the account untouched — surface the current cash/position.
  const [acct] = await db().select({ cash: paperAccounts.cash }).from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1);
  const [pos] = await db()
    .select()
    .from(paperPositions)
    .where(and(eq(paperPositions.userId, userId), eq(paperPositions.symbol, symbol)))
    .limit(1);
  log.info("paper.order", { userId, symbol, side, order_type: "market", quantity, status: "working", reason: "stale_quote", source });
  return {
    orderId: row!.id,
    status: "working",
    symbol,
    side,
    orderType: "market",
    quantity,
    limitPrice: null,
    fillPrice: null,
    rejectReason: null,
    realizedPnl: null,
    cash: acct?.cash ?? config.paperStartingCash(),
    position: pos ? { symbol: pos.symbol, quantity: pos.quantity, avgCost: pos.avgCost } : null,
  };
}

/**
 * Match the user's resting working orders against the current live quote. For each
 * working order: expire it if `tif='day'` and it was placed on an earlier ET day; else
 * fill it — a LIMIT order when the quote crosses (at the crossing quote), a queued MARKET
 * order once the quote is fresh again (at the live quote). Per-symbol fetches run with
 * bounded concurrency and are isolated — one flaky quote never aborts the batch.
 */
export async function matchWorkingOrders(userId: string): Promise<{ scanned: number; filled: number; expired: number }> {
  const working = await db()
    .select()
    .from(paperOrders)
    .where(and(eq(paperOrders.userId, userId), eq(paperOrders.status, "working")));
  if (working.length === 0) return { scanned: 0, filled: 0, expired: 0 };

  let filled = 0;
  let expired = 0;

  await mapLimit(working, MATCH_CONCURRENCY, async (o) => {
    try {
      const now = new Date();
      // Expire stale day orders without touching the market.
      if (isDayExpired(o.tif, o.createdAt, now)) {
        const upd = await db()
          .update(paperOrders)
          .set({ status: "rejected", rejectReason: "day_expired", cancelledAt: now })
          .where(and(eq(paperOrders.id, o.id), eq(paperOrders.status, "working")))
          .returning({ id: paperOrders.id });
        if (upd[0]) expired++;
        return;
      }

      const quote = await marketdata.getLiveQuote(o.symbol);
      const price = quote?.price ?? null;
      if (price == null || price <= 0) return; // no price → leave working

      if (o.orderType === "market") {
        // Queued market order: fill once the quote is live again (the open). Still stale → wait.
        if (isQuoteStale(quote!.quoteTs, now, config.paperQuoteMaxStaleMs())) return;
      } else {
        const limit = o.limitPrice;
        if (limit == null || limit <= 0) return; // defensive — should not happen for a working limit order
        if (!limitCrosses(o.side as OrderSide, price, limit)) return;
      }

      await db().transaction(async (tx) => {
        // Re-check status under the row to avoid a double-fill if two matchers race.
        const [cur] = await tx.select({ status: paperOrders.status }).from(paperOrders).where(eq(paperOrders.id, o.id)).for("update").limit(1);
        if (cur?.status !== "working") return;
        // Fill at the live QUOTE. For a limit order that's the crossing quote (buy crosses only
        // when quote ≤ limit, sell when quote ≥ limit), so the fill honors the limit as a bound
        // and gives price improvement — filling AT the limit would overpay a marketable buy /
        // undersell a marketable sell. For a queued market order it's simply the now-fresh quote.
        const out = await applyFill(tx, userId, o.symbol, o.side as OrderSide, o.quantity, price, now);
        await tx
          .update(paperOrders)
          .set({
            status: out.filled ? "filled" : "rejected",
            fillPrice: out.fillPrice,
            realizedPnl: out.realizedPnl,
            rejectReason: out.rejectReason,
            filledAt: out.filled ? now : null,
            cancelledAt: out.filled ? null : now,
          })
          .where(eq(paperOrders.id, o.id));
        if (out.filled) filled++;
      });
    } catch (err) {
      log.warn("paper.match.error", { userId, order_id: o.id, symbol: o.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  });

  if (filled || expired) log.info("paper.match", { userId, scanned: working.length, filled, expired });
  return { scanned: working.length, filled, expired };
}

/** Cancel a resting (working) order. No-op-safe: only a working order transitions. */
export async function cancelPaperOrder(userId: string, orderId: string): Promise<{ ok: boolean; status: string | null }> {
  const upd = await db()
    .update(paperOrders)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(eq(paperOrders.id, orderId), eq(paperOrders.userId, userId), eq(paperOrders.status, "working")))
    .returning({ id: paperOrders.id });
  if (upd[0]) {
    log.info("paper.cancel", { userId, order_id: orderId });
    return { ok: true, status: "cancelled" };
  }
  // Either it doesn't exist (for this user) or it's already terminal — report current status.
  const [row] = await db().select({ status: paperOrders.status }).from(paperOrders).where(and(eq(paperOrders.id, orderId), eq(paperOrders.userId, userId))).limit(1);
  return { ok: false, status: row?.status ?? null };
}

/** Shape a fill outcome into the public order result. */
function toResult(orderId: string, status: OrderStatus, o: { symbol: string; side: OrderSide; orderType: OrderType; quantity: number; limitPrice: number | null }, out: FillOutcome): PaperOrderResult {
  return {
    orderId,
    status,
    symbol: o.symbol,
    side: o.side,
    orderType: o.orderType,
    quantity: o.quantity,
    limitPrice: o.limitPrice,
    fillPrice: out.fillPrice,
    rejectReason: out.rejectReason,
    realizedPnl: out.realizedPnl,
    cash: out.cash,
    position: out.position,
  };
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
    status: o.status as OrderStatus,
    symbol: o.symbol,
    side: o.side as OrderSide,
    orderType: o.orderType as OrderType,
    quantity: o.quantity,
    limitPrice: o.limitPrice,
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
