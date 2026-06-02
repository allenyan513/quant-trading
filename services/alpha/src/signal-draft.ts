/**
 * Deterministic guardrail for the agent's `emit_signal` output.
 *
 * The model fills emit_signal per a JSON schema (enums for direction/conviction),
 * but numeric fields (target/stop/horizon) are free-form and can be implausible
 * (negative, NaN, a buy whose target sits below the entry price). This sanitizer
 * is a pure function that DROPS implausible values rather than inventing
 * replacements — a missing target is safe downstream; a fabricated one is not.
 * It never changes the model's direction or thesis.
 */
import type { SignalDraft, Direction, Conviction } from "@qt/shared";

const DIRECTIONS = new Set<Direction>(["buy", "sell", "hold"]);
const CONVICTIONS = new Set<Conviction>(["low", "medium", "high"]);

const MAX_HORIZON_DAYS = 365;

/** Finite positive number, else null. */
function posOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

export interface SanitizeResult {
  draft: SignalDraft;
  warnings: string[];
}

/**
 * Clean a raw emit_signal payload into a valid SignalDraft.
 * @param raw          the model's emit_signal.input (untrusted)
 * @param entryPrice   current price (for directional sanity); null skips those checks
 */
export function sanitizeSignalDraft(raw: Partial<SignalDraft>, entryPrice: number | null): SanitizeResult {
  const warnings: string[] = [];

  const direction: Direction =
    raw.direction && DIRECTIONS.has(raw.direction) ? raw.direction : "hold";
  if (direction !== raw.direction) warnings.push(`invalid direction ${JSON.stringify(raw.direction)} → hold`);

  const conviction: Conviction =
    raw.conviction && CONVICTIONS.has(raw.conviction) ? raw.conviction : "medium";
  if (conviction !== raw.conviction) warnings.push(`invalid conviction ${JSON.stringify(raw.conviction)} → medium`);

  const thesis = typeof raw.thesis === "string" ? raw.thesis : "";

  let target = posOrNull(raw.target_price);
  if (target === null && raw.target_price != null) warnings.push(`dropped non-positive target_price ${JSON.stringify(raw.target_price)}`);
  let stop = posOrNull(raw.stop_loss);
  if (stop === null && raw.stop_loss != null) warnings.push(`dropped non-positive stop_loss ${JSON.stringify(raw.stop_loss)}`);

  // horizon: positive integer within [1, MAX_HORIZON_DAYS], else null.
  let horizon: number | null = null;
  if (typeof raw.horizon_days === "number" && Number.isFinite(raw.horizon_days)) {
    const h = Math.round(raw.horizon_days);
    if (h >= 1 && h <= MAX_HORIZON_DAYS) horizon = h;
    else warnings.push(`dropped out-of-range horizon_days ${JSON.stringify(raw.horizon_days)}`);
  } else if (raw.horizon_days != null) {
    warnings.push(`dropped non-numeric horizon_days ${JSON.stringify(raw.horizon_days)}`);
  }

  if (direction === "hold") {
    // A hold is not a trade — price levels are meaningless. Null them (see #20).
    if (target !== null || stop !== null) warnings.push("hold: cleared target_price/stop_loss");
    target = null;
    stop = null;
  } else if (entryPrice != null && Number.isFinite(entryPrice) && entryPrice > 0) {
    // Directional sanity: drop levels on the wrong side of entry (keep direction).
    const wantAbove = direction === "buy"; // buy: target above, stop below; sell: mirror
    if (target !== null && (wantAbove ? target <= entryPrice : target >= entryPrice)) {
      warnings.push(`dropped ${direction} target_price ${target} on wrong side of entry ${entryPrice}`);
      target = null;
    }
    if (stop !== null && (wantAbove ? stop >= entryPrice : stop <= entryPrice)) {
      warnings.push(`dropped ${direction} stop_loss ${stop} on wrong side of entry ${entryPrice}`);
      stop = null;
    }
  }

  return {
    draft: { direction, target_price: target, stop_loss: stop, horizon_days: horizon, conviction, thesis },
    warnings,
  };
}
