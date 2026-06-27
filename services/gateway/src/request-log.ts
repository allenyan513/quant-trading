import type { MiddlewareHandler } from "hono";
import { log } from "./log.js";

/**
 * Structured per-request access log — the gateway is the front door, so this is where
 * request visibility belongs. The old Next web got this for free (Next auto-logs every
 * request); Hono doesn't, which is why the gateway terminal looked silent. Logged AFTER
 * the response so it carries the final status + duration; goes through the shared logger
 * → stdout only (text in dev, JSON in prod). Access logs are high-volume, so they opt
 * out of the `system_logs` DB sink (`sink: false`) to avoid flooding the table + pg pool.
 *
 * Skips /health (compose/Cloud Run healthcheck noise) and CORS preflight (OPTIONS).
 * The event is a readable summary (`GET /api/foo 200 12ms`) so Cloud Logging's collapsed
 * view is scannable; only 5xx is logged at error severity (→ Cloud Run Error Reporting),
 * routine 4xx stay at info. In prod, raise LOG_LEVEL to suppress the info access logs.
 */
export const requestLog: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const { method, path } = c.req;
  if (method === "OPTIONS" || path === "/health") return;
  const status = c.res.status;
  const ms = Date.now() - start;
  // Readable one-line summary (`GET /api/foo 200 12ms`) so Cloud Logging's
  // collapsed view is scannable, instead of a wall of identical "request" lines
  // (the JSON `message` field mirrors the event name). method/path/status stay
  // in fields for structured filtering.
  const event = `${method} ${path} ${status} ${ms}ms`;
  const fields = { method, path, status, ms };
  // Only server faults (5xx) get error severity — Cloud Run surfaces those in
  // Error Reporting. Client errors (4xx) are routine here (the SPA polls
  // constantly and expired sessions return 401/403), so keep them at info
  // rather than flooding the logs with WARNING/ERROR rows.
  // `sink: false` — access logs are high-volume; keep them out of the
  // `system_logs` DB table (still on stdout/Cloud Logging).
  if (status >= 500) log.error(event, fields, { sink: false });
  else log.info(event, fields, { sink: false });
};
