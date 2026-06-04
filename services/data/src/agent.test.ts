import { describe, it, expect } from "vitest";
import { buildTriagePrompt, sanitizeTriageDraft } from "./agent.js";

describe("buildTriagePrompt", () => {
  it("includes symbol, category, title and truncates the body", () => {
    const p = buildTriagePrompt({
      symbol: "AAPL",
      category: "stock",
      title: "Apple beats",
      text: "x".repeat(5000),
      sector: "Technology",
    });
    expect(p).toContain("NEWS ITEM for AAPL (sector: Technology)");
    expect(p).toContain("category: stock");
    expect(p).toContain("Apple beats");
    // body capped at 2000 chars
    expect(p.length).toBeLessThan(2400);
  });

  it("tolerates null title/text/sector", () => {
    const p = buildTriagePrompt({ symbol: "MSFT", category: "general", title: null, text: null });
    expect(p).toContain("NEWS ITEM for MSFT");
    expect(p).not.toContain("sector:");
  });
});

describe("sanitizeTriageDraft", () => {
  it("passes through a valid draft, uppercasing the symbol", () => {
    const d = sanitizeTriageDraft({ symbol: "aapl", material: true, priority: "high", rationale: "catalyst" }, "AAPL");
    expect(d).toEqual({ symbol: "AAPL", material: true, priority: "high", rationale: "catalyst" });
  });

  it("falls back to low for an invalid priority", () => {
    expect(sanitizeTriageDraft({ priority: "urgent" as never, material: true, rationale: "x" }, "AAPL").priority).toBe("low");
  });

  it("coerces a non-true material to false", () => {
    expect(sanitizeTriageDraft({ material: undefined, priority: "low", rationale: "x" }, "AAPL").material).toBe(false);
  });

  it("keeps an explicit null symbol but falls back when absent", () => {
    expect(sanitizeTriageDraft({ symbol: null, material: false, priority: "low", rationale: "" }, "AAPL").symbol).toBeNull();
    expect(sanitizeTriageDraft({ material: false, priority: "low", rationale: "" }, "AAPL").symbol).toBe("AAPL");
  });

  it("truncates an overlong rationale", () => {
    expect(sanitizeTriageDraft({ material: true, priority: "med", rationale: "y".repeat(5000) }, "AAPL").rationale.length).toBe(2000);
  });
});
