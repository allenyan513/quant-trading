/**
 * Deterministic position settlement decision — the pure core of portfolio's
 * `/jobs/track`. Given an open position, the current price, and now, decide
 * whether it closes (target/stop/expiry) and its realized return. No DB/FMP/IO,
 * so it is trivially unit-testable; the service owns price fetch + DB writes.
 *
 * v1 is long-only; the sell branch is kept for completeness (realized return is
 * symmetric: exit/entry - 1 for buy, entry/exit - 1 for sell).
 */

export interface SettleInput {
  direction: string;
  entryPrice: number | null;
  /** Current/exit price (caller fetches it; null if unavailable). */
  price: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  /** Position expiry (ms epoch) or null if it never expires. */
  expiresAtMs: number | null;
  /** Evaluation time (ms epoch). */
  nowMs: number;
}

export type SettleDecision =
  | { close: true; status: "target_hit" | "stopped_out" | "expired"; realizedReturn: number }
  | { close: false };

function lifecycleHit(
  direction: string,
  price: number,
  target: number | null,
  stop: number | null,
): "target_hit" | "stopped_out" | null {
  if (direction === "buy") {
    if (target != null && price >= target) return "target_hit";
    if (stop != null && price <= stop) return "stopped_out";
  } else if (direction === "sell") {
    if (target != null && price <= target) return "target_hit";
    if (stop != null && price >= stop) return "stopped_out";
  }
  return null;
}

/** Decide whether an open position closes now, and its realized return. */
export function settleDecision(input: SettleInput): SettleDecision {
  const { direction, entryPrice, price, targetPrice, stopLoss, expiresAtMs, nowMs } = input;
  // Without a price (or entry) we cannot mark to market or compute a return.
  if (price == null || price <= 0 || entryPrice == null || entryPrice <= 0) return { close: false };

  const hit = lifecycleHit(direction, price, targetPrice, stopLoss);
  const status = hit ?? (expiresAtMs != null && nowMs > expiresAtMs ? "expired" : null);
  if (status == null) return { close: false };

  const realizedReturn = direction === "buy" ? price / entryPrice - 1 : entryPrice / price - 1;
  return { close: true, status, realizedReturn };
}
