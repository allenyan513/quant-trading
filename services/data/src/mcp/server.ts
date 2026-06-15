/**
 * MCP server exposing the quant-trading system's per-symbol research data to
 * Claude. One tool, `get_symbol_research`, returns the same data the dashboard
 * shows (valuation / financials / chart / news / analysts) as JSON for Claude to
 * summarize. Stateless: index.ts builds a fresh server per request.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSymbolResearch, RESEARCH_SECTIONS } from "./research.js";
import { getHoldingsExport, HOLDINGS_SECTIONS } from "../holdings/export.js";

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

  return server;
}
