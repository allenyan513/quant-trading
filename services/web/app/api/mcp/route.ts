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
 * basePath "/api" ⇒ served at /api/mcp.
 */
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { auth } from "@/lib/auth-server";
import { registerPublicTools } from "@/lib/mcp/register-public-tools";
import { getHoldingsExport, HOLDINGS_SECTIONS } from "@/lib/mcp/holdings";
import { listWatchlistOverview } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNAUTH = { content: [{ type: "text" as const, text: "Not authenticated." }], isError: true };

/** The token's user id, injected by verifyToken into AuthInfo.extra. Never trust a
 *  client-supplied user — tenant isolation depends on this coming from the token. */
function userIdFrom(extra?: { authInfo?: { extra?: Record<string, unknown> } }): string | null {
  const uid = extra?.authInfo?.extra?.userId;
  return typeof uid === "string" && uid ? uid : null;
}

// web is read-only DB (T12): the one WRITE tool (submit_morning_brief) forwards to the
// data service, which owns data_morning_briefs. Static process.env.DATA_URL (Next
// inlines it; config.dataUrl would read empty in a route handler).
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

const mcpHandler = createMcpHandler(
  (server) => {
    // Public market-data tools (single source of truth).
    registerPublicTools(server);

    server.registerTool(
      "get_holdings",
      {
        title: "Your brokerage holdings (positions, trades, performance)",
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
        title: "Your watchlist (followed symbols + valuation)",
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
        title: "Save today's morning brief to your archive",
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
        const resp = await fetch(`${dataUrl()}/morning-brief/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId, date, markdown, summary }),
        });
        const json = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: unknown;
          error?: { code?: string; message?: string } | string;
        };
        if (!resp.ok || !json.ok) {
          const err = json.error;
          const msg = typeof err === "string" ? err : (err?.message ?? err?.code ?? `data service returned ${resp.status}`);
          return { content: [{ type: "text", text: `Failed to save brief: ${msg}` }], isError: true };
        }
        return { content: [{ type: "text", text: `Saved morning brief for ${date}.` }] };
      },
    );
  },
  {},
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
