/**
 * 13F sync — pulls each tracked manager's most recent quarterly filings from SEC
 * EDGAR and upserts them into `data_13f_holdings` (immutable snapshots, idempotent
 * by (cik, quarter, cusip, put_call); an amendment supersedes via onConflictDoUpdate).
 * Plus the self-maintained CUSIP→ticker map writer. data owns all three tables.
 */
import { sql, eq, isNull } from "drizzle-orm";
import { db, dbSchema, resolveCusips } from "@qt/shared";
import { fetchLatest13F, padCik, type Quarter13F } from "@qt/shared/thirteenf";
import { ensureFilersSeeded, getActiveFilers } from "./filers.js";
import { log } from "../log.js";

const { thirteenFHoldings, thirteenFCusipMap } = dbSchema;

const ex = (col: string) => sql.raw(`excluded.${col}`);

/** Upsert one quarter's holdings for a filer. Returns rows written. */
async function upsertQuarter(cik: string, q: Quarter13F): Promise<number> {
  if (q.holdings.length === 0) return 0;
  const knownAt = new Date(`${q.filingDate}T00:00:00Z`);
  await db()
    .insert(thirteenFHoldings)
    .values(
      q.holdings.map((h) => ({
        cik,
        quarter: q.reportDate,
        cusip: h.cusip,
        putCall: h.putCall,
        issuerName: h.issuerName,
        titleOfClass: h.titleOfClass || null,
        value: h.value,
        shares: h.shares,
        accessionNumber: q.accessionNumber,
        knownAt,
      })),
    )
    .onConflictDoUpdate({
      target: [thirteenFHoldings.cik, thirteenFHoldings.quarter, thirteenFHoldings.cusip, thirteenFHoldings.putCall],
      set: {
        issuerName: ex("issuer_name"),
        titleOfClass: ex("title_of_class"),
        value: ex("value"),
        shares: ex("shares"),
        accessionNumber: ex("accession_number"),
        knownAt: ex("known_at"),
      },
    });
  return q.holdings.length;
}

/** Sync one filer: pull the latest `quarters` filings, upsert each. Best-effort
 *  (a filer with no filings / parse failure logs + yields zero, never throws). */
export async function sync13FForFiler(cik: string, quarters = 2): Promise<{ cik: string; quarters: number; rows: number }> {
  const digits = String(cik).replace(/\D/g, "");
  if (!digits) {
    // No digits → Number() would be NaN → padCik("0000000NaN") → bogus SEC request.
    log.warn("13f.sync.invalid_cik", { cik });
    return { cik, quarters: 0, rows: 0 };
  }
  const padded = padCik(Number(digits));
  const filings = await fetchLatest13F(Number(digits), quarters);
  if (!filings || filings.length === 0) {
    log.warn("13f.sync.empty", { cik: padded });
    return { cik: padded, quarters: 0, rows: 0 };
  }
  let rows = 0;
  for (const q of filings) rows += await upsertQuarter(padded, q);
  log.info("13f.sync.filer", { cik: padded, quarters: filings.length, rows });
  return { cik: padded, quarters: filings.length, rows };
}

// Per-sync ceiling on inline ticker resolution. Bounds the OpenFIGI tail of a
// sync call (anonymous ≈250 jobs/min); the cron chips away across runs, and
// `/13f/resolve-tickers` backfills the rest on demand.
const INLINE_RESOLVE_CAP = 300;

/** Sync every active manager (cron entry point). Seeds the starter roster first,
 *  then best-effort resolves a batch of still-unmapped CUSIPs → tickers. */
export async function sync13FAll(quarters = 2): Promise<{ filers: number; rows: number; tickersMapped: number }> {
  await ensureFilersSeeded();
  const filers = await getActiveFilers();
  let rows = 0;
  for (const f of filers) {
    const res = await sync13FForFiler(f.cik, quarters);
    rows += res.rows;
  }
  // Ticker resolution is a best-effort enrichment — never fail the sync over it.
  let tickersMapped = 0;
  try {
    tickersMapped = (await resolveUnmappedCusips(INLINE_RESOLVE_CAP)).mapped;
  } catch (err) {
    log.warn("13f.cusip.resolve.failed", { error: err instanceof Error ? err.message : String(err) });
  }
  log.info("13f.sync.done", { filers: filers.length, rows, tickersMapped });
  return { filers: filers.length, rows, tickersMapped };
}

/**
 * Resolve holdings' still-unmapped CUSIPs → tickers via OpenFIGI and cache them
 * into `data_13f_cusip_map`. Only scans CUSIPs absent from the map (left-join
 * null), so it's idempotent and cheap once warm. `limit` bounds one run; call
 * repeatedly to backfill a large initial set.
 */
export async function resolveUnmappedCusips(limit = 1000): Promise<{ scanned: number; mapped: number }> {
  const rows = await db()
    .selectDistinct({ cusip: thirteenFHoldings.cusip })
    .from(thirteenFHoldings)
    .leftJoin(thirteenFCusipMap, eq(thirteenFCusipMap.cusip, thirteenFHoldings.cusip))
    .where(isNull(thirteenFCusipMap.cusip))
    .limit(limit);
  const cusips = rows.map((r) => r.cusip);
  if (cusips.length === 0) return { scanned: 0, mapped: 0 };

  const resolved = await resolveCusips(cusips);
  // Upsert a row for EVERY scanned CUSIP — resolved ones get a ticker, the rest a
  // null tombstone — so misses leave the unmapped set and aren't re-queried next
  // sync. (Scan is left-join-null, so none of these collide with existing rows.)
  const now = new Date();
  await db()
    .insert(thirteenFCusipMap)
    .values(
      cusips.map((cusip) => {
        const t = resolved.get(cusip);
        return { cusip, ticker: t?.ticker ?? null, name: t?.name ?? null, updatedAt: now };
      }),
    )
    .onConflictDoUpdate({
      target: thirteenFCusipMap.cusip,
      set: { ticker: ex("ticker"), name: ex("name"), updatedAt: ex("updated_at") },
    });
  log.info("13f.cusip.resolved", { scanned: cusips.length, mapped: resolved.size });
  return { scanned: cusips.length, mapped: resolved.size };
}

/** Upsert a self-maintained CUSIP→ticker mapping. Resolved at read time, so this
 *  immediately enriches existing holdings snapshots without a re-pull. */
export async function setCusipMapping(cusip: string, ticker: string, name?: string): Promise<{ cusip: string }> {
  const c = cusip.trim().toUpperCase();
  const t = ticker.trim().toUpperCase();
  await db()
    .insert(thirteenFCusipMap)
    .values({ cusip: c, ticker: t, name: name?.trim() || null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: thirteenFCusipMap.cusip,
      set: { ticker: t, name: name?.trim() || null, updatedAt: new Date() },
    });
  log.info("13f.cusip.mapped", { cusip: c, ticker: t });
  return { cusip: c };
}
