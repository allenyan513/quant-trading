/**
 * Deterministic position sizing — Portfolio Construction (T7).
 *
 * Pure function: (signal, sector, current book, params) -> sizing decision.
 * No DB/FMP/IO — the call site loads the open book and looks up the sector, so
 * this stays trivially unit-testable and portable. Today it is called from
 * evaluation's /signals intake; in the v2 refactor it moves into a dedicated
 * portfolio service UNCHANGED (see docs/plans/T7-portfolio-construction.md).
 *
 * v1 scope: long-only, paper-money, sizing-by-conviction with per-name / sector
 * / cash caps. Sells/holds, exits, shorts, add-to-position and a real
 * correlation matrix are explicitly out of scope (later tasks).
 */

export interface SizingParams {
  /** Total paper capital; only scales notional, not the weight logic. */
  capital: number;
  /** Base weight (fraction of capital) per conviction tier. */
  sizeByConviction: { low: number; medium: number; high: number };
  /** Max simultaneously open positions. */
  maxPositions: number;
  /** Per-name weight ceiling. */
  maxWeightPerName: number;
  /** Per-sector weight ceiling. */
  maxSectorWeight: number;
}

/** Minimal projection of an open position the sizer needs. */
export interface OpenPosition {
  symbol: string;
  sector: string | null;
  targetNotional: number;
}

export interface SizingSignal {
  symbol: string;
  direction: "buy" | "sell" | "hold";
  conviction: "low" | "medium" | "high" | null;
  entryPrice: number | null;
}

export interface SizingInput {
  signal: SizingSignal;
  /** Sector of the incoming symbol (looked up by the caller; null if unknown). */
  sector: string | null;
  /** Current open book. */
  book: OpenPosition[];
  params: SizingParams;
}

export type SizingDecision =
  | {
      action: "open";
      targetWeight: number;
      targetNotional: number;
      shares: number;
      reasons: string[];
    }
  | { action: "reject"; reasons: string[] };

/**
 * Decide whether to open a position for `signal` given the current `book`, and
 * how large. Rules are applied in order and short-circuit; every cap/trim is
 * recorded in `reasons` for explainability.
 */
export function sizePosition(input: SizingInput): SizingDecision {
  const { signal, sector, book, params } = input;
  const reasons: string[] = [];

  // 1. Direction gate — v1 long-only.
  if (signal.direction !== "buy") {
    return { action: "reject", reasons: ["non_buy_direction"] };
  }
  // 2. Entry price sanity.
  if (signal.entryPrice == null || signal.entryPrice <= 0) {
    return { action: "reject", reasons: ["missing_entry_price"] };
  }
  // 3. Dedup — v1 does not add to an existing position.
  if (book.some((p) => p.symbol === signal.symbol)) {
    return { action: "reject", reasons: ["already_holding"] };
  }
  // 4. Max positions.
  if (book.length >= params.maxPositions) {
    return { action: "reject", reasons: ["max_positions_reached"] };
  }

  // 5. Base weight by conviction (null or invalid -> low, the most conservative tier).
  const conviction = (signal.conviction === "medium" || signal.conviction === "high")
    ? signal.conviction
    : "low";
  let weight = params.sizeByConviction[conviction];

  // 6. Per-name cap.
  if (weight > params.maxWeightPerName) {
    weight = params.maxWeightPerName;
    reasons.push("capped_per_name");
  }

  // 7. Sector cap (only when the incoming symbol's sector is known).
  if (sector != null) {
    const sectorNotional = book
      .filter((p) => p.sector === sector)
      .reduce((sum, p) => sum + p.targetNotional, 0);
    const sectorHeadroom = params.maxSectorWeight - sectorNotional / params.capital;
    if (sectorHeadroom <= 0) {
      return { action: "reject", reasons: [...reasons, "sector_cap_reached"] };
    }
    if (weight > sectorHeadroom) {
      weight = sectorHeadroom;
      reasons.push("capped_by_sector");
    }
  }

  // 8. Cash constraint.
  const openNotional = book.reduce((sum, p) => sum + p.targetNotional, 0);
  const cash = params.capital - openNotional;
  if (cash <= 0) {
    return { action: "reject", reasons: [...reasons, "no_cash"] };
  }
  let notional = weight * params.capital;
  if (notional > cash) {
    notional = cash;
    weight = notional / params.capital;
    reasons.push("capped_by_cash");
  }

  // 9. Shares.
  const shares = notional / signal.entryPrice;
  return { action: "open", targetWeight: weight, targetNotional: notional, shares, reasons };
}
