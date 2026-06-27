import type { MiddlewareHandler } from "hono";
import { log } from "./log.js";

/**
 * Structured per-request access log — the gateway is the front door, so this is where
 * request visibility belongs. The old Next web got this for free (Next auto-logs every
 * request); Hono doesn't, which is why the gateway terminal looked silent. Logged AFTER
 * the response so it carries the final status + duration; goes through the shared logger
 * → stdout (text in dev, JSON in prod) AND the `system_logs` sink (so the System → Logs
 * page shows gateway access logs, which web never wrote there).
 *
 * Skips /health (compose/Cloud Run healthcheck noise) and CORS preflight (OPTIONS).
 * Level tracks status so the dashboard color-codes: 2xx/3xx info, 4xx warn, 5xx error.
 * In prod, raise LOG_LEVEL to suppress the info access logs if the volume is unwanted.
 */
export const requestLog: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const { method, path } = c.req;
  if (method === "OPTIONS" || path === "/health") return;
  const status = c.res.status;
  const fields = { method, path, status, ms: Date.now() - start };
  if (status >= 500) log.error("request", fields);
  else if (status >= 400) log.warn("request", fields);
  else log.info("request", fields);
};
