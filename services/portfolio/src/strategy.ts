/**
 * Strategy ledger — the alpha-signal-driven auto-sim (`portfolio_positions`).
 *
 * Signal handling for the Strategy book. Routes an incoming signal:
 *  - symbol already held → re-decision (T10): a bearish (sell) view closes the
 *    long; otherwise hold (v1 long-only — no add/reduce yet).
 *  - not held → deterministic sizing → open (or reject).
 *
 * Portfolio owns this end to end (it alone reads/writes `positions`); alpha
 * stays a stateless opinion engine. Sizing/re-decision are pure functions in
 * @qt/shared; this module is the DB I/O around them. Settlement lives in track.ts.
 */
import { and, eq } from "drizzle-orm";
import {
  db,
  dbSchema,
  config,
  sizePosition,
  reviewHolding,
  type SizingParams,
  type OpenPosition,
  type TradingSignalDTO,
} from "@qt/shared";
import { log } from "./log.js";

const { positions, tradingSignals, universe } = dbSchema;

function sizingParams(): SizingParams {
  return {
    capital: config.portfolioCapital(),
    sizeByConviction: config.sizeByConviction(),
    maxPositions: config.maxPositions(),
    maxWeightPerName: config.maxWeightPerName(),
    maxSectorWeight: config.maxSectorWeight(),
  };
}

export interface SizingOutcome {
  position: "opened" | "rejected" | "closed" | "held";
  reasons: string[];
}

/**
 * Route a delivered signal against the current book: re-decide an existing
 * holding, or size a new one. Idempotent on `positions.signalId`.
 */
export async function handleSignal(s: TradingSignalDTO): Promise<SizingOutcome> {
  // Open book with the fields both re-decision and sizing need.
  const openRows = await db()
    .select({
      signalId: positions.signalId,
      symbol: positions.symbol,
      sector: positions.sectorAtEntry,
      targetNotional: positions.targetNotional,
      entryPrice: positions.entryPrice,
      direction: positions.direction,
    })
    .from(positions)
    .where(eq(positions.status, "open"));

  // ---- Re-decision (T10): incoming signal is for a symbol we already hold ----
  const held = openRows.find((r) => r.symbol === s.symbol);
  if (held) {
    if (reviewHolding({ direction: s.direction }) === "close") {
      // Exit at the current price embedded in the new signal (avoids a fetch).
      const exit = s.entry_price;
      const realized =
        exit != null && held.entryPrice != null && held.entryPrice > 0
          ? held.direction === "buy"
            ? exit / held.entryPrice - 1
            : held.entryPrice / exit - 1
          : null;
      await db()
        .update(positions)
        .set({ status: "closed", closedAt: new Date(), exitPrice: exit, realizedReturn: realized })
        .where(and(eq(positions.signalId, held.signalId), eq(positions.status, "open")));
      // Mirror the lifecycle onto the position's originating signal.
      await db().update(tradingSignals).set({ status: "closed" }).where(eq(tradingSignals.id, held.signalId));
      log.info("portfolio.rdecision.closed", {
        signal: s.id,
        symbol: s.symbol,
        closed_position: held.signalId,
        exit,
        realized_return: realized == null ? null : Number(realized.toFixed(4)),
      });
      return { position: "closed", reasons: ["rdecision_sell"] };
    }
    log.info("portfolio.rdecision.hold", { signal: s.id, symbol: s.symbol, direction: s.direction });
    return { position: "held", reasons: [`rdecision_${s.direction}`] };
  }

  // ---- Not held → deterministic sizing → open or reject ----
  const uni = await db()
    .select({ sector: universe.sector })
    .from(universe)
    .where(eq(universe.symbol, s.symbol))
    .limit(1);
  const sector = uni[0]?.sector ?? null;

  const book: OpenPosition[] = openRows.map((r) => ({
    symbol: r.symbol,
    sector: r.sector,
    targetNotional: r.targetNotional ?? 0,
  }));

  const params = sizingParams();
  const decision = sizePosition({
    signal: {
      symbol: s.symbol,
      direction: s.direction,
      conviction: s.conviction,
      entryPrice: s.entry_price,
    },
    sector,
    book,
    params,
  });

  if (decision.action === "open") {
    await db()
      .insert(positions)
      .values({
        signalId: s.id,
        symbol: s.symbol,
        direction: s.direction,
        status: "open",
        targetWeight: decision.targetWeight,
        targetNotional: decision.targetNotional,
        entryPrice: s.entry_price,
        shares: decision.shares,
        sectorAtEntry: sector,
        sizingReasons: decision.reasons,
        sizingParams: params,
      })
      .onConflictDoNothing({ target: positions.signalId });
    log.info("portfolio.opened", {
      signal: s.id,
      symbol: s.symbol,
      weight: Number(decision.targetWeight.toFixed(4)),
      notional: Number(decision.targetNotional.toFixed(2)),
      reasons: decision.reasons,
    });
    return { position: "opened", reasons: decision.reasons };
  }

  log.info("portfolio.rejected", { signal: s.id, symbol: s.symbol, reasons: decision.reasons });
  return { position: "rejected", reasons: decision.reasons };
}
