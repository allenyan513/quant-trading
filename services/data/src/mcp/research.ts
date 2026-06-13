/**
 * Symbol research bundle for the MCP tool. Proxies the web dashboard's read-only
 * `/api/*` endpoints (with the JOB_TOKEN bearer) so the MCP returns exactly the
 * data the website shows — no duplicated query logic. Each section is best-effort:
 * a failing section is reported in `errors`, not fatal to the whole bundle.
 */
import { config } from "@qt/shared";
import { log } from "../log.js";

export const RESEARCH_SECTIONS = [
  "overview",
  "valuation",
  "financials",
  "chart",
  "news",
  "analysts",
] as const;
export type ResearchSection = (typeof RESEARCH_SECTIONS)[number];

/** Map a section to the web API path that backs it (same routes the dashboard uses). */
function pathFor(section: ResearchSection, sym: string): string {
  switch (section) {
    case "overview":
      return `/api/data/symbol/${sym}/overview`;
    case "valuation":
      return `/api/data/valuation/${sym}`;
    case "financials":
      return `/api/data/symbol/${sym}/financials`;
    case "chart":
      return `/api/data/symbol/${sym}/prices?days=400`;
    case "analysts":
      return `/api/data/symbol/${sym}/analysts`;
    case "news":
      return `/api/news?symbol=${sym}&limit=20`;
  }
}

async function fetchSection(base: string, token: string, path: string): Promise<unknown> {
  const url = new URL(path, base).toString();
  const resp = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(10_000), // don't hang the tool if web is unresponsive
  });
  const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; data?: unknown; error?: string };
  if (!resp.ok || !json.ok) throw new Error(json.error ?? `${path} → HTTP ${resp.status}`);
  return json.data;
}

export interface SymbolResearch {
  symbol: string;
  sections: Record<string, unknown>;
  errors?: Record<string, string>;
}

/** Fetch a symbol's research bundle. `sections` defaults to all. */
export async function getSymbolResearch(
  symbol: string,
  sections?: ResearchSection[],
): Promise<SymbolResearch> {
  const sym = symbol.trim().toUpperCase();
  const base = config.webUrl();
  const token = config.jobToken();
  // Dedupe so a caller passing repeated sections doesn't fan out duplicate fetches.
  const wanted = Array.from(new Set(sections?.length ? sections : RESEARCH_SECTIONS));

  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  await Promise.all(
    wanted.map(async (s) => {
      try {
        out[s] = await fetchSection(base, token, pathFor(s, sym));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors[s] = msg;
        log.warn("mcp.fetch_section_failed", { symbol: sym, section: s, error: msg });
      }
    }),
  );

  return { symbol: sym, sections: out, ...(Object.keys(errors).length ? { errors } : {}) };
}
