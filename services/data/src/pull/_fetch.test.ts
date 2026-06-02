import { describe, it, expect } from "vitest";
import { fetchPerSymbol } from "./_fetch.js";

describe("fetchPerSymbol", () => {
  it("isolates per-symbol failures (one throw doesn't abort the rest)", async () => {
    const out = await fetchPerSymbol(
      ["A", "B", "C"],
      async (s) => {
        if (s === "B") throw new Error("boom");
        return [s];
      },
      { label: "test" },
    );
    expect(Object.fromEntries(out.map((g) => [g.symbol, g.rows]))).toEqual({ A: ["A"], B: [], C: ["C"] });
  });

  it("treats a null result as empty rows", async () => {
    const out = await fetchPerSymbol(["A"], async () => null, { label: "test" });
    expect(out).toEqual([{ symbol: "A", rows: [] }]);
  });

  it("caps in-flight requests at batchSize", async () => {
    let active = 0;
    let maxActive = 0;
    const symbols = Array.from({ length: 25 }, (_, i) => `S${i}`);
    await fetchPerSymbol(
      symbols,
      async (s) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return [s];
      },
      { label: "test", batchSize: 10 },
    );
    expect(maxActive).toBeLessThanOrEqual(10);
    expect(maxActive).toBeGreaterThan(1); // sanity: it IS concurrent within a batch
  });

  it("returns one entry per symbol, preserving order", async () => {
    const out = await fetchPerSymbol(["X", "Y", "Z"], async (s) => [s], { label: "test" });
    expect(out.map((g) => g.symbol)).toEqual(["X", "Y", "Z"]);
  });
});
