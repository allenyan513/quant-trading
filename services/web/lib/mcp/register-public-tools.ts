/**
 * Registers the PUBLIC market-data MCP tools (SEC / public sources only) on an MCP
 * server. Used by the OAuth-gated `/api/mcp` endpoint alongside the private account
 * tools — kept in its own module so the public tool surface is defined in one place.
 * Tools read the read-only DB directly via the shared queries (same as the dashboard).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSymbolResearch, RESEARCH_SECTIONS } from "@/lib/mcp/research";
import { getInvestorsList, getInvestorDetail, THIRTEENF_SECTIONS } from "@/lib/mcp/thirteenf";
import { dataPost } from "@/lib/data-proxy";

// EDGAR full-text search is a LIVE external call (not a DB read), so it forwards to
// data — the sole external-data receiver — rather than hitting efts from web.
const searchFilingsViaData = (body: Record<string, unknown>): Promise<unknown> => dataPost("/edgar/search", body);

export function registerPublicTools(server: McpServer): void {
  server.registerTool(
    "get_symbol_research",
    {
      title: "Get Symbol Research",
      description:
        "Fetch this quant-trading system's data for a stock ticker and return it as " +
        "structured JSON to summarize/analyze: reference valuation (fair value, DCF/" +
        "consensus, verdict + upside), financials (income/balance/cash-flow + key " +
        "ratios, multi-year), price history (OHLCV with a fair-value overlay), recent " +
        "news, analyst activity (ratings, price targets, estimates), ownership " +
        "(SEC 13D/13G activist/passive >5% filings + which tracked 13F legends hold it + " +
        "insider transactions from SEC Form 4, with transaction codes and the 10b5-1 flag), " +
        "and material events (SEC 8-K current reports with item codes: earnings, leadership " +
        "changes, M&A, bankruptcy, …). Use whenever the user asks to research, analyze, value, " +
        "or deep-dive a specific stock symbol.",
      inputSchema: {
        symbol: z.string().describe("Stock ticker, e.g. AAPL, NVDA, TSLA"),
        sections: z
          .array(z.enum(RESEARCH_SECTIONS))
          .optional()
          .describe("Limit to these sections; defaults to all (valuation, financials, chart, news, analysts, ownership, events)."),
      },
    },
    async ({ symbol, sections }) => {
      const data = await getSymbolResearch(symbol, sections);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    "list_13f_investors",
    {
      title: "List 13F Investors",
      description:
        "List the famous 'superinvestor' fund managers this system tracks from SEC 13F filings " +
        "(Buffett, Burry, Ackman, Tepper, Tiger Global, …), each with a snapshot of their latest filed " +
        "quarter: position count, total reported portfolio value, the quarter, and the filing date. " +
        "Sorted newest-filed first by default. Use this to discover who's available (and get a CIK or " +
        "name) before calling get_13f_investor. 13F is public, ~45-day-lagged quarterly data.",
      inputSchema: {
        sort: z
          .enum(["recent", "value", "name"])
          .optional()
          .describe("Order: recent=newest 13F filing first (default), value=largest portfolio, name=A–Z."),
        limit: z.number().int().positive().max(200).optional().describe("Max investors to return (default all, ~80)."),
      },
    },
    async ({ sort, limit }) => {
      const data = await getInvestorsList({ sort, limit });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    "get_13f_investor",
    {
      title: "Get 13F Investor",
      description:
        "Fetch one tracked investor's latest 13F as structured JSON: current holdings (ticker, issuer, " +
        "% of portfolio, shares, reported price, value) plus this quarter's activity vs the prior quarter — " +
        "buys (new + increased) and sells (trimmed + exited) — and a summary of counts. Use when the user " +
        "asks what a legendary investor holds or what they bought/sold (e.g. 'what did Buffett buy this " +
        "quarter', 'Michael Burry's portfolio'). Identify the investor by CIK or by name/label ('0001067983', " +
        "'Buffett', 'Berkshire'); if unsure, call list_13f_investors first. Public, ~45-day-lagged quarterly data — not live.",
      inputSchema: {
        investor: z
          .string()
          .describe("CIK (e.g. 0001067983) or name/label (e.g. 'Buffett', 'Berkshire', 'Tiger Global')."),
        topN: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Max holdings rows (default 50; buys/sells are never truncated)."),
        sections: z
          .array(z.enum(THIRTEENF_SECTIONS))
          .optional()
          .describe("Limit to these sections; defaults to all (summary, holdings, buys, sells)."),
      },
    },
    async ({ investor, topN, sections }) => {
      const data = await getInvestorDetail(investor, { topN, sections });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    "search_filings",
    {
      title: "Search Filings",
      description:
        "Search the full text of every SEC EDGAR filing since 2001 by keyword or \"quoted phrase\". Returns the " +
        "matching filings — company, ticker, form type, filing date, 8-K item codes (when present), and a direct " +
        "link to the matched document — plus the total match count. Optionally restrict by form type(s) and a " +
        "filing-date range. Use for cross-company theme/keyword discovery (e.g. 'which companies disclosed " +
        "<topic> this year', 'who mentions <technology>') or to locate a specific filing. Public SEC data, not per-account.",
      inputSchema: {
        query: z.string().describe("Keywords, or a \"quoted phrase\" for an exact-phrase match."),
        forms: z.array(z.string()).optional().describe("Restrict to these form types, e.g. [\"8-K\"] or [\"10-K\",\"10-Q\"]."),
        startDate: z.string().optional().describe("Earliest filing date (YYYY-MM-DD)."),
        endDate: z.string().optional().describe("Latest filing date (YYYY-MM-DD)."),
        limit: z.number().int().positive().max(100).optional().describe("Max results to return (default 20)."),
      },
    },
    async ({ query, forms, startDate, endDate, limit }) => {
      const data = await searchFilingsViaData({ query, forms, startDate, endDate, limit });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
}
