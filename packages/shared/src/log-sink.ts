/**
 * Logs DB sink — best-effort, non-blocking persistence of structured logs.
 *
 * Always on except under test (the dashboard reads `system_logs` for heartbeats
 * + recent errors); vitest stays off so unit tests never touch the DB.
 * Used by `log.ts`: after writing to stdout, log lines are fire-and-forget
 * enqueued here. Writes go through a bounded serial queue (one INSERT at a
 * time) so we never exhaust the pg pool (max 5), and every error is swallowed
 * — logging must never break the business path.
 *
 * Raw SQL via getPool() (not Drizzle) to avoid a log -> schema import cycle.
 */

import { getPool } from "./db/client.js";
import type { LogFields } from "./log.js";

type LogLevel = "debug" | "info" | "warn" | "error";

// Constant (no env knob): on everywhere except tests. vitest sets VITEST=true
// (and NODE_ENV=test); guard on both so a stray NODE_ENV can't enable the sink
// mid-test and hit the DB.
function sinkEnabled(): boolean {
  return !process.env.VITEST && process.env.NODE_ENV !== "test";
}

export function isSinkEnabled(): boolean {
  return sinkEnabled();
}

interface LogRow {
  ts: string;
  level: LogLevel;
  service: string;
  event: string;
  fields?: LogFields;
}

// Common trace keys we promote to indexed columns for filtering / joining.
function extract(fields: LogFields | undefined): {
  symbol: string | null;
  externalId: string | null;
  notificationId: string | null;
  signalId: string | null;
  rest: Record<string, unknown> | null;
} {
  if (!fields) {
    return { symbol: null, externalId: null, notificationId: null, signalId: null, rest: null };
  }
  const asStr = (v: unknown): string | null => (typeof v === "string" ? v : v == null ? null : String(v));
  const symbol = asStr(fields.symbol);
  const externalId = asStr(fields.external_id ?? fields.externalId);
  const notificationId = asStr(fields.notification_id ?? fields.notificationId);
  // `signal` is the conventional field carrying a signal id in the codebase.
  const signalId = asStr(fields.signal ?? fields.signal_id ?? fields.signalId);

  // Normalize values the same way log.ts's stdout path does: Error has
  // non-enumerable message/stack, so a raw JSON.stringify yields "{}" and the
  // dashboard would show empty errors. Keep the message; ISO-ify Dates.
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    rest[k] = v instanceof Error ? v.message : v instanceof Date ? v.toISOString() : v;
  }
  return { symbol, externalId, notificationId, signalId, rest };
}

let queue: Promise<void> = Promise.resolve();
let warnedOnce = false;

const INSERT_SQL = `
  INSERT INTO system_logs (id, ts, level, service, event, symbol, external_id, notification_id, signal_id, fields)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
`;

let counter = 0;
function makeId(ts: string): string {
  // Monotonic-ish, collision-resistant enough for a logs table.
  counter = (counter + 1) % 1_000_000;
  return `${ts}-${process.pid}-${counter}`;
}

/**
 * Fire-and-forget: enqueue a log row for DB persistence. Returns immediately.
 * No-ops when the sink is disabled.
 */
export function sinkLog(row: LogRow): void {
  if (!sinkEnabled()) return;

  const { symbol, externalId, notificationId, signalId, rest } = extract(row.fields);
  const id = makeId(row.ts);
  const values = [
    id,
    row.ts,
    row.level,
    row.service,
    row.event,
    symbol,
    externalId,
    notificationId,
    signalId,
    rest ? JSON.stringify(rest) : null,
  ];

  queue = queue
    .then(() => getPool().query(INSERT_SQL, values))
    .then(
      () => undefined,
      (err: unknown) => {
        // Swallow — logging must never break the caller. Warn once on stderr.
        if (!warnedOnce) {
          warnedOnce = true;
          console.error("[log-sink] disabled after error:", (err as Error)?.message ?? err);
        }
      },
    );
}
