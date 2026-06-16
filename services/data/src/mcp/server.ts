/**
 * MCP server exposing the quant-trading system's data to Claude as JSON tools:
 *   - get_symbol_research — per-symbol research (valuation/financials/chart/news/analysts)
 *   - get_holdings        — the operator's own live IBKR account
 *   - list_13f_investors  — tracked legendary investors (13F) + latest-quarter snapshot
 *   - get_13f_investor    — one investor's 13F holdings + this-quarter buys/sells
 * Stateless: index.ts builds a fresh server per request.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSymbolResearch, RESEARCH_SECTIONS } from "./research.js";
import { getHoldingsExport, HOLDINGS_SECTIONS } from "../holdings/export.js";
import { getInvestorsList, getInvestorDetail, THIRTEENF_SECTIONS } from "./thirteenf.js";

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "qt-research", version: "0.1.0" });

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
          .describe(
            "Limit to these sections; defaults to all (valuation, financials, chart, news, analysts).",
          ),
      },
    },
    async ({ symbol, sections }) => {
      const data = await getSymbolResearch(symbol, sections);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    "get_holdings",
    {
      title: "The operator's live IBKR brokerage account",
      description:
        "Fetch the operator's REAL connected IBKR account (a single live brokerage account, synced " +
        "via Flex) as structured JSON: current positions (symbol, quantity, market value, % weight, " +
        "option greeks), recent executed trades, and performance (NAV index base-100 at inception + " +
        "CAGR / Sharpe / Sortino / Max Drawdown / Volatility / Beta / Alpha / Info Ratio vs SPY). " +
        "Use when the user asks about THEIR OWN portfolio: 'my holdings/positions', 'how is my " +
        "account doing', 'my P&L / returns', 'what did I trade recently'. Distinct from " +
        "get_symbol_research, which is public per-stock research, not the user's account.",
      inputSchema: {
        sections: z
          .array(z.enum(HOLDINGS_SECTIONS))
          .optional()
          .describe("Limit to these sections; defaults to all (performance, positions, trades)."),
        tradesLimit: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .describe("Max recent trades to return (default 50, cap 200)."),
      },
    },
    async ({ sections, tradesLimit }) => {
      const data = await getHoldingsExport({ sections, tradesLimit });
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

  return server;
}
