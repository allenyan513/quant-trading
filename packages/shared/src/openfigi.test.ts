import { describe, it, expect, vi, afterEach } from "vitest";
import { pickTicker, collectBatch, resolveCusips } from "./openfigi.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("pickTicker", () => {
  it("prefers the US composite listing", () => {
    expect(
      pickTicker([
        { ticker: "AAPL.MX", exchCode: "MM" },
        { ticker: "AAPL", exchCode: "US", name: "APPLE INC" },
      ]),
    ).toEqual({ ticker: "AAPL", name: "APPLE INC" });
  });
  it("falls back to the first ticketed listing when there is no US composite", () => {
    expect(pickTicker([{ ticker: "ry", exchCode: "TO", name: "Royal Bank" }])).toEqual({
      ticker: "RY",
      name: "Royal Bank",
    });
  });
  it("returns null when no entry carries a ticker", () => {
    expect(pickTicker([{ exchCode: "US" }])).toBeNull();
    expect(pickTicker([])).toBeNull();
  });
});

describe("collectBatch", () => {
  it("aligns results to request CUSIPs by index and skips misses", () => {
    const m = collectBatch(
      ["037833100", "000000000", "191216100"],
      [
        { data: [{ ticker: "AAPL", exchCode: "US", name: "APPLE INC" }] },
        { warning: "No identifier found." },
        { data: [{ ticker: "KO", exchCode: "US" }] },
      ],
    );
    expect(m.get("037833100")).toEqual({ ticker: "AAPL", name: "APPLE INC" });
    expect(m.has("000000000")).toBe(false); // warning → unmapped
    expect(m.get("191216100")).toEqual({ ticker: "KO", name: null });
    expect(m.size).toBe(2);
  });
});

describe("resolveCusips", () => {
  it("dedupes + uppercases, batches under the anonymous 10-job cap, returns a map", async () => {
    const cusips = Array.from({ length: 12 }, (_, i) => `CUSIP${String(i).padStart(4, "0")}`);
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const jobs = JSON.parse(String((init as RequestInit).body)) as { idValue: string }[];
      const results = jobs.map((j) => ({ data: [{ ticker: `T_${j.idValue}`, exchCode: "US" }] }));
      return new Response(JSON.stringify(results), { status: 200 });
    });
    // Feed duplicates + a lowercase dup — all collapse to the 12 distinct CUSIPs.
    const out = await resolveCusips([...cusips, ...cusips, "cusip0000"]);
    expect(spy).toHaveBeenCalledTimes(2); // 12 distinct / 10 per batch → 2 requests
    expect(out.size).toBe(12);
    expect(out.get("CUSIP0000")).toEqual({ ticker: "T_CUSIP0000", name: null });
  });

  it("retries on 429 then succeeds", async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      n += 1;
      if (n === 1) return new Response("rate limited", { status: 429 });
      return new Response(JSON.stringify([{ data: [{ ticker: "AAPL", exchCode: "US" }] }]), { status: 200 });
    });
    const p = resolveCusips(["037833100"]);
    await vi.runAllTimersAsync(); // flush the backoff sleep
    const out = await p;
    expect(n).toBe(2);
    expect(out.get("037833100")).toEqual({ ticker: "AAPL", name: null });
  });
});
