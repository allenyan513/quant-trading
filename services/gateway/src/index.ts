/**
 * API gateway — the single HTTP front door for every client (web SPA, native
 * iOS/Android, and the OAuth-gated MCP connector). Hono, structurally identical
 * to data/alpha/portfolio (see `.claude/rules/services.md`).
 *
 * PR1 scope: the read-only DB layer lifted out of `services/web` (`./db` +
 * `./queries/*`) behind 3 representative public reads (static / query-param /
 * path-param). Auth + MCP + the rest of the business routes land in PR2/PR3;
 * the SPA + DNS cutover in PR4/PR5. No writes here — write forwards to the
 * owning services (data/portfolio) arrive with PR3's proxy move.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ok, fail, config } from "@qt/shared";
import { route } from "./route.js";
import { log } from "./log.js";
import { getOverview, getCompanyProfile } from "./queries/index.js";

const app = new Hono();

// CORS for cross-origin SPA/native clients. Permissive default in dev; PR4 pins
// it to the SPA origin via GATEWAY_CORS_ORIGINS once cookies are in play.
const corsOrigins = config.gatewayCorsOrigins();
app.use(
  "*",
  cors({ origin: corsOrigins === "*" ? "*" : corsOrigins.split(",").map((o) => o.trim()) }),
);

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
