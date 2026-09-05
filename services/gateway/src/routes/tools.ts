/**
 * Public, sign-in-free tools (the SEO surface: /tools/* on the SPA).
 *
 * These are the only unauthenticated POST routes that spend FMP quota, so they
 * carry a coarse per-IP throttle before forwarding to data — which owns market
 * data and runs the actual backtest (T12: the gateway never fetches externally).
 */
import type { Hono } from "hono";
import { fail } from "@qt/shared";
import { route, readBody } from "../route.js";
import { dataPost, DataProxyError } from "../data-proxy.js";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
/** Per-instance only (Cloud Run runs several) — a speed bump against a hot loop,
 *  not a security control. The cost it protects is FMP calls on cache misses. */
const hits = new Map<string, number[]>();

function throttled(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Bound the map so a spray of IPs can't grow it without limit.
  if (hits.size > 5_000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_PER_WINDOW;
}

function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}

export function registerToolsRoutes(app: Hono): void {
  app.post(
    "/tools/dividend-backtest",
    route("tools.dividendBacktest", async (c) => {
      if (throttled(clientIp(c.req.raw.headers))) {
        return c.json(fail("rate_limited", "Too many backtests — wait a minute and try again."), 429);
      }
      try {
        return await dataPost("/tools/dividend-backtest", await readBody(c));
      } catch (err) {
        // data validates the request; keep its 4xx a 4xx instead of a blanket 500.
        if (err instanceof DataProxyError && err.status >= 400 && err.status < 500) {
          return c.json(fail(err.code ?? "bad_request", err.message), 400);
        }
        throw err;
      }
    }),
  );
}
