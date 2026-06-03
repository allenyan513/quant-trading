import { describe, it, expect } from "vitest";
import { maxObservedAt } from "./watermark.js";

describe("maxObservedAt", () => {
  it("returns null when no payloads parse", () => {
    expect(maxObservedAt([])).toBeNull();
    expect(maxObservedAt([{ observed_at: null }, { observed_at: undefined }, { observed_at: "nope" }])).toBeNull();
  });

  it("returns the latest parseable observed_at", () => {
    const out = maxObservedAt([
      { observed_at: "2026-05-01" },
      { observed_at: "2026-05-20" },
      { observed_at: "2026-05-10" },
    ]);
    expect(out?.toISOString().slice(0, 10)).toBe("2026-05-20");
  });

  it("ignores unparseable entries among valid ones", () => {
    const out = maxObservedAt([{ observed_at: "garbage" }, { observed_at: "2026-05-05" }, { observed_at: null }]);
    expect(out?.toISOString().slice(0, 10)).toBe("2026-05-05");
  });
});
