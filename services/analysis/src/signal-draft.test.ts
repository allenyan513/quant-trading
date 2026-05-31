import { describe, it, expect } from "vitest";
import { sanitizeSignalDraft } from "./signal-draft.js";

describe("sanitizeSignalDraft", () => {
  it("passes through a well-formed buy and keeps valid levels", () => {
    const { draft, warnings } = sanitizeSignalDraft(
      { direction: "buy", target_price: 120, stop_loss: 90, horizon_days: 30, conviction: "high", thesis: "x" },
      100,
    );
    expect(draft).toEqual({
      direction: "buy", target_price: 120, stop_loss: 90, horizon_days: 30, conviction: "high", thesis: "x",
    });
    expect(warnings).toHaveLength(0);
  });

  it("coerces invalid direction/conviction to safe defaults", () => {
    const { draft, warnings } = sanitizeSignalDraft(
      { direction: "long" as never, conviction: "huge" as never, thesis: "x" },
      100,
    );
    expect(draft.direction).toBe("hold");
    expect(draft.conviction).toBe("medium");
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("drops non-positive / NaN target and stop", () => {
    const { draft } = sanitizeSignalDraft(
      { direction: "buy", target_price: -5, stop_loss: 0, horizon_days: 30, conviction: "low", thesis: "x" },
      100,
    );
    expect(draft.target_price).toBeNull();
    expect(draft.stop_loss).toBeNull();
  });

  it("clamps horizon to [1,365]: drops 0, negative, and oversized; rounds floats", () => {
    expect(sanitizeSignalDraft({ direction: "buy", horizon_days: 0, conviction: "low", thesis: "" }, 100).draft.horizon_days).toBeNull();
    expect(sanitizeSignalDraft({ direction: "buy", horizon_days: 900, conviction: "low", thesis: "" }, 100).draft.horizon_days).toBeNull();
    expect(sanitizeSignalDraft({ direction: "buy", horizon_days: 30.6, conviction: "low", thesis: "" }, 100).draft.horizon_days).toBe(31);
  });

  it("hold clears target_price and stop_loss (issue #20)", () => {
    const { draft, warnings } = sanitizeSignalDraft(
      { direction: "hold", target_price: 100, stop_loss: 95, horizon_days: 30, conviction: "low", thesis: "x" },
      100,
    );
    expect(draft.target_price).toBeNull();
    expect(draft.stop_loss).toBeNull();
    expect(draft.horizon_days).toBe(30); // horizon kept (re-evaluation window)
    expect(warnings).toContain("hold: cleared target_price/stop_loss");
  });

  it("buy: drops target below entry and stop above entry (wrong side)", () => {
    const { draft } = sanitizeSignalDraft(
      { direction: "buy", target_price: 90, stop_loss: 110, horizon_days: 30, conviction: "medium", thesis: "x" },
      100,
    );
    expect(draft.target_price).toBeNull(); // 90 <= 100
    expect(draft.stop_loss).toBeNull(); // 110 >= 100
  });

  it("sell: keeps target below entry and stop above entry", () => {
    const { draft } = sanitizeSignalDraft(
      { direction: "sell", target_price: 80, stop_loss: 110, horizon_days: 30, conviction: "medium", thesis: "x" },
      100,
    );
    expect(draft.target_price).toBe(80);
    expect(draft.stop_loss).toBe(110);
  });

  it("skips directional checks when entry price is unknown", () => {
    const { draft } = sanitizeSignalDraft(
      { direction: "buy", target_price: 90, stop_loss: 110, horizon_days: 30, conviction: "low", thesis: "x" },
      null,
    );
    expect(draft.target_price).toBe(90);
    expect(draft.stop_loss).toBe(110);
  });
});
