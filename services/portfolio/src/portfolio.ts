/**
 * Portfolio construction (T7) — deterministic position sizing at signal intake.
 *
 * This is the portfolio service's owned logic: it alone reads/writes the
 * `positions` table. It receives a delivered trading signal (forwarded from
 * evaluation's outbox), sizes it via the pure `sizePosition` in @qt/shared, and
 * records an opened position. A rejected position is a normal business result.
 * (Pre-T6 this lived in evaluation; see docs/plans/T6-portfolio-service.md.)
 */
import { eq } from "drizzle-orm";
import {
  db,
  dbSchema,
  config,
  sizePosition,
  type SizingParams,
  type OpenPosition,
  type TradingSignalDTO,
} from "@qt/shared";
import { log } from "./log.js";

const { positions, universe } = dbSchema;

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
  position: "opened" | "rejected";
  reasons: string[];
}

/** Load the open book, size the signal, and record an opened position (idempotent). */
export async function sizeAndRecord(s: TradingSignalDTO): Promise<SizingOutcome> {
  const openRows = await db()
    .select({
      symbol: positions.symbol,
      sector: positions.sectorAtEntry,
      targetNotional: positions.targetNotional,
    })
    .from(positions)
    .where(eq(positions.status, "open"));

  const book: OpenPosition[] = openRows.map((r) => ({
    symbol: r.symbol,
    sector: r.sector,
    targetNotional: r.targetNotional ?? 0,
  }));

  const uni = await db()
    .select({ sector: universe.sector })
    .from(universe)
    .where(eq(universe.symbol, s.symbol))
    .limit(1);
  const sector = uni[0]?.sector ?? null;

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
