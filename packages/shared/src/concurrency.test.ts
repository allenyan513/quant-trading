import { describe, it, expect } from "vitest";
import { mapLimit } from "./concurrency.js";

describe("mapLimit", () => {
  it("preserves input order regardless of completion order", async () => {
    // Later items resolve sooner, so a naive collector would scramble the order.
    const out = await mapLimit([30, 20, 10], 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(out).toEqual([0, 1, 2]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("processes every item exactly once", async () => {
    const seen: number[] = [];
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (x) => {
      seen.push(x);
      return x * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns an empty array for empty input without invoking fn", async () => {
    let called = false;
    const out = await mapLimit([], 10, async () => {
      called = true;
      return 1;
    });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it("does not abort the batch when fn isolates its own failures", async () => {
    // Mirrors getPeers: fn catches per-item errors and returns null.
    const out = await mapLimit([1, 2, 3], 2, async (x) => {
      try {
        if (x === 2) throw new Error("boom");
        return x;
      } catch {
        return null;
      }
    });
    expect(out).toEqual([1, null, 3]);
  });
});
