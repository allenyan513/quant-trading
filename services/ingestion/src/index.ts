/**
 * Ingestion service — the sole receiver of external info. v1: scheduled pull
 * only. Cloud Scheduler hits /pull/* on a cron; each pulled item becomes an
 * event, persisted (dedup) and delivered to analysis with outbox fallback.
 */
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { ok, fail, config, type EventPayload } from "@qt/shared";
import { ingestAndNotifyAll, redeliverPending } from "./deliver.js";
import { pullEarnings } from "./pull/earnings.js";
import { pullRatings } from "./pull/ratings.js";
import { pullNews } from "./pull/news.js";
import { pullPriceTargets } from "./pull/price-target.js";
import { pullInsider } from "./pull/insider.js";
import { pullMna } from "./pull/mna.js";
import { getWatchlistSymbols } from "./watchlist.js";
import { log } from "./log.js";

const app = new Hono();

app.get("/healthz", (c) => c.json(ok({ service: "ingestion", status: "up" })));

function defaultWindow(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 3 * 24 * 3600 * 1000); // last 3 days
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

interface PullArgs {
  from: string;
  to: string;
  symbols: string[];
  limit?: number;
}
type Puller = (args: PullArgs) => Promise<EventPayload[]>;

/**
 * Build a /pull/* handler. All six pulls share the same shape: parse body →
 * default `symbols` to the watchlist (fail-fast on empty, so we never pull
 * market-wide by accident) → resolve the window → run the puller → persist +
 * deliver aggregated notifications → return counts. Only the puller and the
 * log/error `name` (snake_case id, e.g. "price_targets") differ, so behavior
 * changes (skipped counting, ET day boundaries, …) happen in ONE place.
 */
function makePullRoute(name: string, puller: Puller) {
  return async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
      const symbols = (body.symbols as string[] | undefined) ?? (await getWatchlistSymbols());
      if (symbols.length === 0) {
        return c.json(fail("empty_watchlist", "seed the watchlist first (pnpm seed:watchlist)"), 400);
      }
      const win = defaultWindow();
      const args: PullArgs = {
        from: (body.from as string) ?? win.from,
        to: (body.to as string) ?? win.to,
        symbols,
        limit: body.limit as number | undefined,
      };
      log.info(`pull.${name}.start`, { from: args.from, to: args.to, symbols: symbols.length });
      const payloads = await puller(args);
      log.info(`pull.${name}.fetched`, { events: payloads.length });
      const res = await ingestAndNotifyAll(payloads);
      log.info(`pull.${name}.done`, { pulled: payloads.length, ...res });
      return c.json(ok({ pulled: payloads.length, ...res }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`pull.${name}.failed`, { error: msg });
      return c.json(fail(`pull_${name}_failed`, msg), 500);
    }
  };
}

app.post("/pull/earnings", makePullRoute("earnings", pullEarnings));
app.post("/pull/ratings", makePullRoute("ratings", pullRatings));
app.post("/pull/news", makePullRoute("news", pullNews));
app.post("/pull/price-targets", makePullRoute("price_targets", pullPriceTargets));
app.post("/pull/insider", makePullRoute("insider", pullInsider));
// mna's endpoint is market-wide; `symbols` is the watchlist to match deals against.
app.post("/pull/mna", makePullRoute("mna", pullMna));

app.post("/internal/redeliver", async (c) => {
  try {
    const res = await redeliverPending();
    log.info("redeliver.done", { tried: res.tried, delivered: res.delivered });
    return c.json(ok(res));
  } catch (err) {
    log.error("redeliver.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("redeliver_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
