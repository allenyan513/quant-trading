/**
 * MCP server exposing the quant-trading system's per-symbol research data to
 * Claude. One tool, `get_symbol_research`, returns the same data the dashboard
 * shows (valuation / financials / chart / news / analysts) as JSON for Claude to
 * summarize. Stateless: index.ts builds a fresh server per request.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSymbolResearch, RESEARCH_SECTIONS } from "./research.js";

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
            "Limit to these sections; defaults to all (overview, valuation, financials, chart, news, analysts).",
          ),
      },
    },
    async ({ symbol, sections }) => {
      const data = await getSymbolResearch(symbol, sections);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  return server;
}
