/**
 * Symbol research bundle for the MCP tool. Reads the DB directly via the shared
 * read queries (`@qt/shared/research`) — the same shapes the web dashboard serves,
 * with no extra network hop. Each section is best-effort: a failure is reported
 * in `errors` (and logged), not fatal to the whole bundle.
 */
import { db } from "@qt/shared";
import {
  getLatestValuation,
  getFinancials,
  getPrices,
  getAnalystsData,
  getSymbolNews,
} from "@qt/shared/research";
import { log } from "../log.js";

export const RESEARCH_SECTIONS = ["valuation", "financials", "chart", "news", "analysts"] as const;
export type ResearchSection = (typeof RESEARCH_SECTIONS)[number];

function fetchSection(section: ResearchSection, sym: string): Promise<unknown> {
  const d = db();
  switch (section) {
    case "valuation":
      return getLatestValuation(d, sym);
    case "financials":
      return getFinancials(d, sym, { period: "annual", limit: 8 });
    case "chart":
      return getPrices(d, sym, { days: 400 });
    case "analysts":
      return getAnalystsData(d, sym);
    case "news":
      return getSymbolNews(d, sym, 20);
  }
}

export interface SymbolResearch {
  symbol: string;
  sections: Record<string, unknown>;
  errors?: Record<string, string>;
}

/** Fetch a symbol's research bundle. `sections` defaults to all (deduped). */
export async function getSymbolResearch(
  symbol: string,
  sections?: ResearchSection[],
): Promise<SymbolResearch> {
  const sym = symbol.trim().toUpperCase();
  const wanted = Array.from(new Set(sections?.length ? sections : RESEARCH_SECTIONS));

  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  await Promise.all(
    wanted.map(async (s) => {
      try {
        out[s] = await fetchSection(s, sym);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors[s] = msg;
        log.warn("mcp.fetch_section_failed", { symbol: sym, section: s, error: msg });
      }
    }),
  );

  return { symbol: sym, sections: out, ...(Object.keys(errors).length ? { errors } : {}) };
}
