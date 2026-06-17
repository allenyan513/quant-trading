/**
 * Read queries: structured log search for the system logs page.
 * Read-only, Node runtime only.
 */

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, logs } from "../db.js";

interface LogOpts {
  limit?: number;
  service?: string;
  level?: string;
  symbol?: string;
  event?: string;
  q?: string;
}

export async function listLogs(opts: LogOpts = {}) {
  const limit = Math.min(opts.limit ?? 200, 1000);
  const conds = [];
  if (opts.service) conds.push(eq(logs.service, opts.service));
  if (opts.level) conds.push(eq(logs.level, opts.level));
  if (opts.symbol) conds.push(eq(logs.symbol, opts.symbol));
  if (opts.event) conds.push(ilike(logs.event, `%${opts.event}%`));
  if (opts.q) {
    conds.push(
      or(
        ilike(logs.event, `%${opts.q}%`),
        ilike(sql`${logs.fields}::text`, `%${opts.q}%`),
        ilike(logs.symbol, `%${opts.q}%`),
      ),
    );
  }
  return db()
    .select()
    .from(logs)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(logs.ts))
    .limit(limit);
}
