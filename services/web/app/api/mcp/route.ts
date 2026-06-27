/**
 * MCP endpoint (Model Context Protocol over streamable HTTP) — OAuth-gated. The
 * single connector a user adds to their Claude Desktop / claude.ai. Hosts ALL tools:
 * public market-data (get_symbol_research + two 13F tools, from SEC/public sources)
 * PLUS the PRIVATE per-user account tools (get_holdings / get_watchlist), scoped to
 * the token's user.
 *
 * web is the OAuth 2.1 Authorization Server (Better Auth + mcp() plugin), so token
 * validation is a same-origin `getMcpSession` DB lookup — no cross-service hop. The
 * whole endpoint is gated by mcp-handler's withMcpAuth: an unauthenticated call gets
 * 401 + WWW-Authenticate pointing at /.well-known/oauth-protected-resource → Claude
 * runs the OAuth dance (DCR + PKCE) against the AS and retries with a bearer.
 *
 * The server advertises its identity (serverInfo "SweetValueLab" + instructions) so
 * the connector card shows a branded name/description instead of an anonymous tool
 * list. Tool naming is regular: get_* fetches one resource, list_* a collection,
 * search_* a query; writes use a plain action verb (place_*, submit_*). Each tool's
 * `title` is the Title-Case mirror of its id (clean label in the picker), and the
 * `description` carries the detail the model needs to pick it.
 *
 * basePath "/api" ⇒ served at /api/mcp.
 */
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { auth } from "@/lib/auth-server";
import { registerPublicTools } from "@/lib/mcp/register-public-tools";
import { getHoldingsExport, HOLDINGS_SECTIONS } from "@/lib/mcp/holdings";
import { listWatchlistOverview } from "@/lib/queries";
import { dataPost } from "@/lib/data-proxy";
import { portfolioPost } from "@/lib/portfolio-proxy";
import { getPaperAccount } from "@qt/shared/paper-read";
import { listMemos } from "@qt/shared/memo-read";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNAUTH = { content: [{ type: "text" as const, text: "Not authenticated." }], isError: true };

/** The token's user id, injected by verifyToken into AuthInfo.extra. Never trust a
 *  client-supplied user — tenant isolation depends on this coming from the token. */
function userIdFrom(extra?: { authInfo?: { extra?: Record<string, unknown> } }): string | null {
  const uid = extra?.authInfo?.extra?.userId;
  return typeof uid === "string" && uid ? uid : null;
}

// web is read-only DB (T12): the one WRITE tool (submit_morning_brief) forwards to
// the data service (owner of data_morning_briefs) via dataPost.
const mcpHandler = createMcpHandler(
  (server) => {
    // Public market-data tools (single source of truth).
    registerPublicTools(server);

    server.registerTool(
      "get_holdings",
      {
        title: "Get Holdings",
        description:
          "Fetch the signed-in user's own IBKR portfolio as structured JSON: current positions " +
          "(symbol, asset class, quantity, market value, weight, option greeks), recent trades, and " +
          "performance (NAV index + KPIs: CAGR, Sharpe, Sortino, max drawdown, Calmar, beta, alpha vs " +
          "SPY). Private + per-user — only ever returns the authenticated user's account. Use when the " +
          "user asks about their portfolio, positions, P&L, or risk metrics.",
        inputSchema: {
          sections: z
            .array(z.enum(HOLDINGS_SECTIONS))
            .optional()
            .describe("Limit to these sections; defaults to all (performance, positions, trades)."),
          tradesLimit: z.number().int().positive().max(200).optional().describe("Max recent trades (default 50)."),
        },
      },
      async ({ sections, tradesLimit }, extra) => {
        const userId = userIdFrom(extra);
        if (!userId) return UNAUTH;
        const data = await getHoldingsExport(userId, { sections, tradesLimit });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.registerTool(
      "get_watchlist",
      {
        title: "Get Watchlist",
        description:
          "Fetch the signed-in user's private watchlist as structured JSON: each followed symbol with " +
          "its note, latest reference valuation (fair value / price / upside % / verdict), sector, and " +
          "whether the user currently holds it — sorted most-undervalued first. Private + per-user. Use " +
          "when the user asks what's on their watchlist or which of their symbols look cheap.",
        inputSchema: {},
      },
      async (_args, extra) => {
        const userId = userIdFrom(extra);
        if (!userId) return UNAUTH;
        const data = await listWatchlistOverview(userId);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.registerTool(
      "submit_morning_brief",
      {
        title: "Submit Morning Brief",
        description:
          "Persist a generated morning brief for the signed-in user so it appears in their dashboard " +
          "archive (/data/morning-brief). Call this at the END of the morning-brief skill — after you've " +
          "written the brief — with the brief's date and the full rendered Markdown (plus an optional " +
          "structured summary for the list view). Idempotent per day: re-submitting the same date " +
          "overwrites. Private + per-user (always saved to the authenticated user's account).",
        inputSchema: {
          date: z.string().describe("The brief's date, YYYY-MM-DD (the US trading day it covers)."),
          markdown: z.string().describe("The full rendered morning brief, in Markdown."),
          summary: z
            .record(z.unknown())
            .optional()
            .describe("Optional structured summary for the list view, e.g. {dayPnlPct, totalValue, topMover}."),
        },
      },
      async ({ date, markdown, summary }, extra) => {
        const userId = userIdFrom(extra);
        if (!userId) return UNAUTH;
        try {
          // dataPost throws on both an envelope error and a network failure — handle uniformly.
          await dataPost("/morning-brief/submit", { userId, date, markdown, summary });
          return { content: [{ type: "text", text: `Saved morning brief for ${date}.` }] };
        } catch (e) {
          return { content: [{ type: "text", text: `Failed to save brief: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
        }
      },
    );

    server.registerTool(
      "get_paper_account",
      {
        title: "Get Paper Account",
        description:
          "Fetch the signed-in user's SIMULATED paper-trading account as structured JSON: cash, cumulative " +
          "realized P&L, net positions (symbol, signed quantity — negative = short — average cost), the resting " +
          "WORKING limit orders (workingOrders — not yet filled, cancellable via cancel_paper_order), and " +
          "the recent terminal order blotter (filled / rejected / cancelled). Private + per-user. Use to " +
          "check the account before deciding a trade, or to review fills after place_paper_order. This is " +
          "the paper account — NOT the real brokerage (that's get_holdings).",
        inputSchema: {},
      },
      async (_args, extra) => {
        const userId = userIdFrom(extra);
        if (!userId) return UNAUTH;
        // Match any resting limit orders that have crossed before reading (no cron — matched on access).
        try {
          await portfolioPost("/paper/match", { userId });
        } catch {
          // Best-effort: a match failure must not block reading the account.
        }
        const data = await getPaperAccount(db(), userId);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.registerTool(
      "place_paper_order",
      {
        title: "Place Paper Order",
        description:
          "Place an order in the signed-in user's SIMULATED paper account. orderType 'market' (default) " +
          "fills immediately at the current live quote and returns the fill — BUT when the market is closed " +
          "(the quote is stale) it instead rests as a WORKING order and fills at the next open, so a market " +
          "order placed after hours comes back status 'working', not 'filled'. 'limit' rests as a WORKING " +
          "order and fills when the quote crosses your limit (buy: quote ≤ limit; sell: quote ≥ limit), at " +
          "the crossing market price — never worse than your limit — use a limit order for a watch/entry " +
          "at a target price (status comes back 'working'). " +
          "A buy adds a long (or covers a short); a sell reduces/closes a long, and a sell beyond the long " +
          "(or from flat) opens a SHORT. Bounded by buying power (cash minus twice the short collateral); an " +
          "order that exceeds it is rejected 'insufficient_buying_power'. Equity only (no options/margin). " +
          "Optionally attach a thesis (rationale " +
          "+ targetPrice / stopPrice / timeHorizon) — recorded with the order, informational only, never " +
          "auto-executed. SIMULATED — never touches a real brokerage. Returns the fill (or working/" +
          "rejected status), resulting position, and remaining cash. Pass a unique idempotencyKey so a " +
          "retry never fills twice.",
        inputSchema: {
          symbol: z.string().describe("Ticker, e.g. MU or AAPL."),
          side: z.enum(["buy", "sell"]).describe("buy adds a long / covers a short; sell reduces a long or opens/extends a short."),
          quantity: z.number().positive().describe("Number of shares (must be > 0)."),
          orderType: z.enum(["market", "limit"]).optional().describe("market (default) fills now; limit rests until the quote crosses."),
          limitPrice: z.number().positive().optional().describe("Required for a limit order — the price to fill at."),
          tif: z.enum(["day", "gtc"]).optional().describe("Time in force for a limit order: gtc (default) or day (expires end of the ET day)."),
          thesis: z.string().optional().describe("Recorded rationale for the trade (why, and when to exit). Informational."),
          targetPrice: z.number().positive().optional().describe("Planned take-profit price (recorded, not auto-executed)."),
          stopPrice: z.number().positive().optional().describe("Planned stop price (recorded, not auto-executed)."),
          timeHorizon: z.string().optional().describe("Planned holding window, free text (e.g. '3 months')."),
          idempotencyKey: z.string().optional().describe("Optional unique key to dedup retries of the SAME order."),
        },
      },
      async ({ symbol, side, quantity, orderType, limitPrice, tif, thesis, targetPrice, stopPrice, timeHorizon, idempotencyKey }, extra) => {
        const userId = userIdFrom(extra);
        if (!userId) return UNAUTH;
        try {
          // Forwards to portfolio (owner). A business rejection (e.g. insufficient_funds) comes back as
          // JSON with status:"rejected" — that's a normal result, not an error.
          const res = await portfolioPost("/paper/orders", { userId, symbol, side, quantity, orderType, limitPrice, tif, thesis, targetPrice, stopPrice, timeHorizon, source: "mcp", idempotencyKey });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        } catch (e) {
          return { content: [{ type: "text", text: `Failed to place order: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
        }
      },
    );

    server.registerTool(
      "cancel_paper_order",
      {
        title: "Cancel Paper Order",
        description:
          "Cancel a resting WORKING limit order in the signed-in user's SIMULATED paper account, by its " +
          "order id (from get_paper_account's workingOrders). Only a working order can be cancelled; a " +
          "filled/rejected/already-cancelled order is left unchanged (the response reports its status). " +
          "Private + per-user.",
        inputSchema: {
          orderId: z.string().describe("The working order's id (from get_paper_account workingOrders)."),
        },
      },
      async ({ orderId }, extra) => {
        const userId = userIdFrom(extra);
        if (!userId) return UNAUTH;
        try {
          const res = await portfolioPost("/paper/orders/cancel", { userId, orderId });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        } catch (e) {
          return { content: [{ type: "text", text: `Failed to cancel order: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
        }
      },
    );

    server.registerTool(
      "submit_memo",
      {
        title: "Submit Memo",
        description:
          "Save an investment memo for the signed-in user — a free-form Markdown document (a thesis, " +
          "trade review, weekly/daily note, research write-up, or reflection) optionally linked to one or " +
          "more tickers. This is where durable REASONING lives (vs the raw trade blotter). For each linked " +
          "symbol the server captures a point-in-time snapshot — price now, the reference valuation, and " +
          "the user's position — so the memo can be graded against reality later; the response returns what " +
          "was anchored. Call this after writing an analysis worth keeping (e.g. a long/short thesis on a " +
          "name). Private + per-user. Pass a unique idempotencyKey so a retry never duplicates.",
        inputSchema: {
          type: z
            .enum(["thesis", "review", "weekly", "research", "reflection", "note", "morning_call"])
            .optional()
            .describe("Memo kind (default 'note'). Use 'thesis' for a long/short case, 'review' for a trade post-mortem."),
          title: z.string().describe("Short memo title / subject."),
          markdown: z.string().describe("The memo body, in Markdown."),
          symbols: z.array(z.string()).optional().describe("Tickers this memo is about, e.g. ['NVDA']. Each gets a PIT snapshot."),
          direction: z.enum(["long", "short", "neutral"]).optional().describe("Directional view, for a thesis."),
          status: z.enum(["active", "closed", "archived"]).optional().describe("Lifecycle (default 'active'); set 'closed' when the thesis has played out."),
          idempotencyKey: z.string().optional().describe("Optional unique key to dedup retries of the SAME memo."),
        },
      },
      async ({ type, title, markdown, symbols, direction, status, idempotencyKey }, extra) => {
        const userId = userIdFrom(extra);
        if (!userId) return UNAUTH;
        try {
          const res = await dataPost("/memos/submit", { userId, type, title, markdown, symbols, direction, status, idempotencyKey });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        } catch (e) {
          return { content: [{ type: "text", text: `Failed to save memo: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
        }
      },
    );

    server.registerTool(
      "update_memo",
      {
        title: "Update Memo",
        description:
          "Edit one of the signed-in user's existing memos (by id, from get_memos): change its title / body / " +
          "direction / status / pinned flag, or attach/detach symbols. Use this to keep a long-running thesis " +
          "memo current, or to mark it 'closed' on exit. NOTE: existing symbols keep their ORIGINAL " +
          "point-in-time snapshot (that's the point of a memo) — only newly added symbols snapshot at " +
          "add-time. Private + per-user.",
        inputSchema: {
          id: z.string().describe("The memo's id (from get_memos)."),
          title: z.string().optional().describe("New title."),
          markdown: z.string().optional().describe("New body (Markdown), replacing the old one."),
          status: z.enum(["active", "closed", "archived"]).optional().describe("New lifecycle status."),
          direction: z.enum(["long", "short", "neutral"]).optional().describe("New directional view."),
          pinned: z.boolean().optional().describe("Pin/unpin as an evergreen memo."),
          addSymbols: z.array(z.string()).optional().describe("Tickers to attach now (each gets a fresh PIT snapshot)."),
          removeSymbols: z.array(z.string()).optional().describe("Tickers to detach."),
        },
      },
      async ({ id, title, markdown, status, direction, pinned, addSymbols, removeSymbols }, extra) => {
        const userId = userIdFrom(extra);
        if (!userId) return UNAUTH;
        try {
          const res = await dataPost("/memos/update", { userId, id, title, markdown, status, direction, pinned, addSymbols, removeSymbols });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        } catch (e) {
          return { content: [{ type: "text", text: `Failed to update memo: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
        }
      },
    );

    server.registerTool(
      "get_memos",
      {
        title: "Get Memos",
        description:
          "Fetch the signed-in user's saved memos as structured JSON (full Markdown body + each linked " +
          "symbol's point-in-time snapshot), newest first. Filter by symbol, type, or status. Call this " +
          "BEFORE reasoning about a name to recall what the user already thinks about it — past theses, " +
          "reviews, and the price/valuation/position captured when each was written. Private + per-user.",
        inputSchema: {
          symbol: z.string().optional().describe("Only memos linked to this ticker (e.g. 'NVDA')."),
          type: z.enum(["thesis", "review", "weekly", "research", "reflection", "note", "morning_call"]).optional().describe("Only memos of this kind."),
          status: z.enum(["active", "closed", "archived"]).optional().describe("Only memos with this status."),
          limit: z.number().int().positive().max(200).optional().describe("Max memos to return (default 50)."),
        },
      },
      async ({ symbol, type, status, limit }, extra) => {
        const userId = userIdFrom(extra);
        if (!userId) return UNAUTH;
        const data = await listMemos(db(), userId, { symbol, type, status, includeBody: true, limit });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );
  },
  {
    // Server identity + guidance shown to the connecting client (and surfaced in
    // Claude's connector card). Without this the server has no name/description and
    // reads as an anonymous set of tools — set it to brand the connector.
    serverInfo: { name: "SweetValueLab", version: "1.0.0" },
    capabilities: { tools: {} },
    instructions:
      "SweetValueLab — the facts layer for AI-native equity research (https://sweetvaluelab.com). " +
      "Point-in-time-correct US-equity facts (SEC filings, ownership, 13F superinvestor holdings, " +
      "insider trades, and a deterministic reference valuation), served as structured JSON for your " +
      "Claude to reason over.\n\n" +
      "Tools fall into two groups:\n" +
      "• Public research (no account needed): get_symbol_research, list_13f_investors, " +
      "get_13f_investor, search_sec_filings.\n" +
      "• Private, per-user account (scoped to your signed-in user): get_holdings (real IBKR portfolio), " +
      "get_watchlist, get_paper_account, place_paper_order + cancel_paper_order (simulated), " +
      "submit_morning_brief, and the MEMO layer — submit_memo / update_memo / get_memos (durable " +
      "investment memos: theses, reviews, notes, each linkable to symbols and anchored to a " +
      "point-in-time snapshot). Recall a name's prior memos with get_memos before reasoning on it.\n\n" +
      "Naming convention: get_* fetches one resource, list_* returns a collection, search_* runs a " +
      "query; write tools use a plain action verb (place_*, submit_*, update_*). The private tools " +
      "always act on the authenticated user's own data — never pass another user's identity.",
  },
  { basePath: "/api" },
);

// Validate the bearer against Better Auth's issued MCP access tokens (opaque,
// DB-backed via getMcpSession). Returns AuthInfo (user id in `extra`) on success →
// mcp-handler exposes it to tools as extra.authInfo; undefined → 401 + PRM pointer.
const verifyToken = async (req: Request, bearerToken?: string) => {
  if (!bearerToken) return undefined;
  const session = await auth.api.getMcpSession({ headers: req.headers });
  if (!session) return undefined;
  return {
    token: bearerToken,
    clientId: session.clientId ?? "",
    scopes: typeof session.scopes === "string" && session.scopes ? session.scopes.split(" ") : [],
    extra: { userId: session.userId ?? null },
  };
};

const handler = withMcpAuth(mcpHandler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { handler as GET, handler as POST, handler as DELETE };
