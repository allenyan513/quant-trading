/**
 * API gateway — the single HTTP front door for every client (web SPA, native
 * iOS/Android, and the OAuth-gated MCP connector). Hono, structurally identical
 * to data/alpha/portfolio (see `.claude/rules/services.md`).
 *
 * Surface so far:
 *  - PR1: read-only DB reads (`/health`, `/overview`, `/data/symbol/:symbol/profile`).
 *  - PR2: Better Auth (`/auth/*`) + OAuth discovery (`/.well-known/*`) + the OAuth-gated
 *    MCP endpoint (`/mcp`) with all 12 tools. The MCP OAuth login/consent UI lives on
 *    the SPA (apex); this gateway is the AS.
 * The rest of the business routes (PR3) + SPA/DNS cutover (PR4/PR5) follow.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq } from "drizzle-orm";
import { ok, config, dbSchema } from "@qt/shared";
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from "better-auth/plugins";
import { route } from "./route.js";
import { db } from "./db.js";
import { log } from "./log.js";
import { requestLog } from "./request-log.js";
import { auth } from "./auth.js";
import { mcpRequestHandler } from "./mcp/server.js";
import { registerSymbolRoutes } from "./routes/symbol.js";
import { registerPipelineRoutes } from "./routes/pipeline.js";
import { registerDiscoverRoutes } from "./routes/discover.js";
import { registerMarketsRoutes } from "./routes/markets.js";
import { registerWatchlistRoutes } from "./routes/watchlist.js";
import { registerHoldingsRoutes } from "./routes/holdings.js";
import { registerPaperRoutes } from "./routes/paper.js";
import { registerMemoRoutes } from "./routes/memos.js";
import { registerLegendsRoutes } from "./routes/legends.js";

const app = new Hono();

// Per-request access log (outermost, so it times the whole request incl. CORS).
app.use("*", requestLog);

// CORS for cross-origin browser clients (the SPA's credentialed `/auth/*` calls in
// particular). Single reflective middleware: in dev (GATEWAY_CORS_ORIGINS unset → "*")
// echo the caller's origin; in prod pin to the allow-list. `credentials: true` so the
// SPA's session cookie rides cross-origin (apex ↔ api subdomain are same-site). Non-
// browser callers (curl, the MCP client) ignore CORS entirely.
const corsAllow = config.gatewayCorsOrigins();
const allowList = corsAllow === "*" ? null : corsAllow.split(",").map((o) => o.trim());
app.use(
  "*",
  cors({
    origin: (origin) => (allowList ? (origin && allowList.includes(origin) ? origin : allowList[0] ?? "") : (origin ?? "*")),
    credentials: true,
  }),
);

// ---- Auth + OAuth (Better Auth is the OAuth 2.1 AS for the MCP connector) ----
// All Better Auth routes (sign-in/out, session, OAuth authorize/token/consent, DCR).
// basePath is "/auth" (set in auth.ts), rootless on the api subdomain.
app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

// OAuth discovery metadata (delegated to Better Auth, fed by the mcp() plugin).
const discovery = oAuthDiscoveryMetadata(auth);
const protectedResource = oAuthProtectedResourceMetadata(auth);
app.get("/.well-known/oauth-authorization-server", (c) => discovery(c.req.raw));
app.get("/.well-known/oauth-protected-resource", (c) => protectedResource(c.req.raw));

// Display info for the SPA's OAuth consent page (the app name + redirect host for a
// client_id). Public — client_id isn't a secret (it rides in the OAuth redirect).
// Replaces the consent page's direct DB read in web.
app.get(
  "/consent-info",
  route("consent.info", async (c) => {
    const clientId = c.req.query("client_id") ?? "";
    if (!clientId) return { name: "", redirectHost: "" };
    const rows = await db()
      .select({ name: dbSchema.oauthApplication.name, redirectUrls: dbSchema.oauthApplication.redirectUrls })
      .from(dbSchema.oauthApplication)
      .where(eq(dbSchema.oauthApplication.clientId, clientId))
      .limit(1);
    const app0 = rows[0];
    if (!app0) return { name: "", redirectHost: "" };
    let redirectHost = "";
    try {
      const first = (app0.redirectUrls ?? "").split(/[\s,]+/).filter(Boolean)[0];
      if (first) redirectHost = new URL(first).host;
    } catch {
      /* leave blank */
    }
    return { name: app0.name, redirectHost };
  }),
);

// OAuth-gated MCP endpoint (streamable HTTP). No token → 401 + WWW-Authenticate → the
// client runs the OAuth dance against the AS above and retries with a bearer.
app.all("/mcp", (c) => mcpRequestHandler(c.req.raw));

// ---- Business routes (the dashboard's data surface, ported from web's /api/*) ----
// Service liveness (compose/Cloud Run healthcheck). Distinct from the pipeline /overview.
app.get("/health", (c) => c.json(ok({ service: "gateway", status: "up" })));

registerSymbolRoutes(app); // public symbol + market-data reads, ensure/warm forwards
registerPipelineRoutes(app); // public system/pipeline reads (overview, events, logs, …)
registerDiscoverRoutes(app); // candidates / scanner / news
registerMarketsRoutes(app); // earnings + economic + movers
registerWatchlistRoutes(app); // per-user watchlist + groups (authed)
registerHoldingsRoutes(app); // per-user IBKR holdings (authed)
registerPaperRoutes(app); // per-user paper account (authed)
registerMemoRoutes(app); // per-user memos + morning-brief archive (authed)
registerLegendsRoutes(app); // 13F superinvestor holdings (public)

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
