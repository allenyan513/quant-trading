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
import { registerPublicTools } from "@/lib/mcp/register-public-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the public market-data tools (shared registrar). The private account tools
// (get_holdings / get_watchlist) live ONLY on the OAuth-gated /api/private/mcp.
const mcpHandler = createMcpHandler(registerPublicTools, {}, { basePath: "/api" });

// No auth (only public market-data tools — get_holdings is excluded), so it's safe
// to leave open for claude.ai connectors. But open + DB-backed ⇒ blunt scraping/DoS
// with a lightweight per-IP fixed-window rate limit (no deps). In-memory ⇒ per Cloud
// Run instance; pair with `gcloud run ... --max-instances` (hard cost ceiling) +
// Cloud Armor for robust distributed limiting. Tune via MCP_RATE_PER_MIN.
const RATE_MAX = Number(process.env.MCP_RATE_PER_MIN ?? "60");
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(req: Request): boolean {
  if (!(RATE_MAX > 0)) return false; // 0/invalid disables the limiter
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k); // prune
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "unknown";
  const e = hits.get(ip);
  if (!e || now >= e.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  e.count += 1;
  return e.count > RATE_MAX;
}

async function handler(req: Request): Promise<Response> {
  if (rateLimited(req)) {
    return Response.json({ error: "rate_limited", message: "too many requests" }, { status: 429 });
  }
  return mcpHandler(req);
}

export { handler as GET, handler as POST, handler as DELETE };
