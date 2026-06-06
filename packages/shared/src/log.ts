/**
 * Minimal structured logger for tracing the distributed flow across services.
 * One readable line per event, e.g.:
 *   12:34:56.789 [data] INFO  pull.earnings.done pulled=3 delivered=3
 *
 * Conventions:
 *  - `event` is a dotted name (`<area>.<step>[.<outcome>]`) so a flow reads top-down.
 *  - Carry a trace key in `fields` (`external_id` for events, `signal` for signals)
 *    so one item can be grepped end-to-end across all three services.
 *
 * Env: LOG_LEVEL=debug|info|warn|error (default info). Format: JSON in
 * production (NODE_ENV=production, e.g. containers) so Cloud Logging reads the
 * severity; human-readable text in dev. Force either with LOG_FORMAT=json|text.
 */
import { sinkLog } from "./log-sink.js";

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.LOG_LEVEL as Level) ?? "info"] ?? ORDER.info;
// Cloud Logging's recognized severity enum (NOTE: "warn" -> "WARNING"). Emitted
// as the `severity` JSON field so Cloud Run tags the level correctly — it does
// NOT parse the level word out of a plain-text line (everything would be DEFAULT).
const SEVERITY: Record<Level, string> = { debug: "DEBUG", info: "INFO", warn: "WARNING", error: "ERROR" };
// JSON in production (containers → Cloud Logging); readable text in local dev.
// LOG_FORMAT=json|text overrides either way.
const asJson =
  process.env.LOG_FORMAT === "json" ||
  (process.env.LOG_FORMAT !== "text" && process.env.NODE_ENV === "production");

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

function fmtValue(v: unknown): string {
  if (v === null) return "null";
  // Error/Date are objects but JSON.stringify mangles them (Error -> "{}" since
  // message/stack are non-enumerable; Date -> a quoted string). Handle first.
  // Use message (not stack) to keep the one-line-per-event invariant.
  if (v instanceof Error) return v.message;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return /[\s="]/.test(v) ? JSON.stringify(v) : v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function fmtFields(fields?: LogFields): string {
  if (!fields) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    parts.push(`${k}=${fmtValue(v)}`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

export function createLogger(service: string): Logger {
  function emit(level: Level, event: string, fields?: LogFields): void {
    if (ORDER[level] < threshold) return;
    const ts = new Date().toISOString();
    // Best-effort DB persistence for the observability dashboard (on except under test).
    sinkLog({ ts, level, service, event, fields });
    const sink = level === "error" || level === "warn" ? console.error : console.log;
    if (asJson) {
      // Normalize Error fields so they don't serialize to "{}".
      const safe: LogFields = {};
      if (fields) for (const [k, v] of Object.entries(fields)) safe[k] = v instanceof Error ? v.message : v;
      // `severity` + `message` are the fields Cloud Logging reads from a JSON
      // payload (for the entry's level + summary line); `event`/`ts` stay for
      // grep/other aggregators.
      sink(JSON.stringify({ severity: SEVERITY[level], message: event, ts, service, event, ...safe }));
      return;
    }
    sink(`${ts.slice(11, 23)} [${service}] ${level.toUpperCase().padEnd(5)} ${event}${fmtFields(fields)}`);
  }
  return {
    debug: (e, f) => emit("debug", e, f),
    info: (e, f) => emit("info", e, f),
    warn: (e, f) => emit("warn", e, f),
    error: (e, f) => emit("error", e, f),
  };
}
