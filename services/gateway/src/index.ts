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
import { ok, fail, config } from "@qt/shared";
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from "better-auth/plugins";
import { route } from "./route.js";
import { log } from "./log.js";
import { getOverview, getCompanyProfile } from "./queries/index.js";
import { auth } from "./auth.js";
import { mcpRequestHandler } from "./mcp/server.js";

const app = new Hono();

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

// OAuth-gated MCP endpoint (streamable HTTP). No token → 401 + WWW-Authenticate → the
// client runs the OAuth dance against the AS above and retries with a bearer.
app.all("/mcp", (c) => mcpRequestHandler(c.req.raw));

// ---- Read routes (PR1) ----
// Service liveness (compose/Cloud Run healthcheck). Distinct from the dashboard's
// cross-pipeline overview below.
app.get("/health", (c) => c.json(ok({ service: "gateway", status: "up" })));

// Cross-pipeline overview funnel (system-wide, public).
app.get(
  "/overview",
  route("overview", (c) => getOverview(Number(c.req.query("windowHours")) || 24)),
);

// Per-symbol company profile (public market data).
app.get(
  "/data/symbol/:symbol/profile",
  route("data.symbol.profile", async (c) => {
    const symbol = c.req.param("symbol")?.trim();
    if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
    return getCompanyProfile(symbol.toUpperCase());
  }),
);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
