/**
 * Position re-decision (T10) — what to do when a new signal arrives for a symbol
 * the book already holds. Portfolio owns this: alpha stays a stateless opinion
 * engine, and the book reacts to fresh views on its holdings instead of letting
 * them ride blindly to a mechanical stop/target/expiry.
 *
 * Pure: no DB/IO. v1 is long-only, so the decision is direction-only — a bearish
 * (sell) view on a long means exit; a still-bullish (buy) or neutral (hold) view
 * means stay (no add/reduce yet — partial sizing is a later task).
 */

export type HoldingAction = "close" | "hold";

/** Decide what to do with an existing long position given a new signal's view. */
export function reviewHolding(input: { direction: "buy" | "sell" | "hold" }): HoldingAction {
  return input.direction === "sell" ? "close" : "hold";
}
