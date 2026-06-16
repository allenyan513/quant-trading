/**
 * MCP endpoint (Model Context Protocol over streamable HTTP) — the system's public
 * data outlet for third-party LLMs. Lives on web (the only public ingress); tools
 * read the read-only DB directly via shared queries (same as the dashboard), so
 * there's no internal HTTP hop back to data. Hosted via `mcp-handler` at /api/mcp.
 *
 * OPEN (no auth) so it works as a claude.ai custom connector — those accept only
 * OAuth or no-auth, NOT a static bearer header. Therefore only PUBLIC market data
 * is exposed: get_symbol_research + the two 13F tools (all from SEC/public sources).
 * get_holdings (the operator's REAL brokerage account) is deliberately NOT
 * registered here — an open endpoint would publish private positions to anyone with
 * the URL. Re-add it only behind real auth (OAuth), or serve it from a separate
 * token-gated route for Claude Desktop/Code. (Export logic kept in lib/mcp/holdings.ts.)
 *
 * Tools: get_symbol_research · list_13f_investors · get_13f_investor.
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getSymbolResearch, RESEARCH_SECTIONS } from "@/lib/mcp/research";
import { getInvestorsList, getInvestorDetail, THIRTEENF_SECTIONS } from "@/lib/mcp/thirteenf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_symbol_research",
      {
        title: "Deep research data for a stock symbol",
        description:
          "Fetch this quant-trading system's data for a stock ticker and return it as " +
          "structured JSON to summarize/analyze: reference valuation (fair value, DCF/" +
          "consensus, verdict + upside), financials (income/balance/cash-flow + key " +
          "ratios, multi-year), price history (OHLCV with a fair-value overlay), recent " +
          "news, and analyst activity (ratings, price targets, estimates). Use whenever " +
          "the user asks to research, analyze, value, or deep-dive a specific stock symbol.",
        inputSchema: {
          symbol: z.string().describe("Stock ticker, e.g. AAPL, NVDA, TSLA"),
          sections: z
            .array(z.enum(RESEARCH_SECTIONS))
            .optional()
            .describe("Limit to these sections; defaults to all (valuation, financials, chart, news, analysts)."),
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
        title: "List tracked legendary investors (13F)",
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
        title: "One legendary investor's 13F holdings + buys/sells",
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
  },
  {},
  { basePath: "/api" },
);

// No auth: only public market-data tools are registered (get_holdings is excluded),
// so the endpoint is safe to leave open for claude.ai custom connectors.
export { mcpHandler as GET, mcpHandler as POST, mcpHandler as DELETE };
