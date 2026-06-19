/**
 * 8-K sync — pulls each universe symbol's recent SEC 8-K material-event filings and
 * upserts them into `data_8k_filings` (immutable, idempotent by accession). 8-Ks are
 * filed BY the subject company, so discovery is per-symbol: ticker → CIK (SEC
 * company_tickers.json) → submissions → 8-K rows (item codes come structured from the
 * feed, no doc parsing). Re-runs are cheap: an accession already stored is skipped
 * before any fetch. data owns the table. Mirrors thirteenf/sync.ts.
 */
import { inArray } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";
import { fetchCompanyTickers, fetch8KFilings } from "@qt/shared/edgar-8k";
import { log } from "../log.js";

const { eightKFilings, universe } = dbSchema;

// Bound the cold ingest: recent ~1y of 8-Ks, capped per symbol. Steady state is
// cheap anyway (accession-skip → only genuinely new filings get written).
const MAX_FILINGS_PER_SYMBOL = 30;
const LOOKBACK_DAYS = 365;

const isoDaysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** PIT timestamp: the acceptance datetime when it's a valid date, else fall back to
 *  the filing date (a malformed acceptanceDateTime must not drop the 8-K). */
function knownAtFor(acceptedAt: string | null, filedDate: string): Date {
  if (acceptedAt) {
    const d = new Date(acceptedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(`${filedDate}T00:00:00Z`);
}

async function existingAccessions(accns: string[]): Promise<Set<string>> {
  if (accns.length === 0) return new Set();
  const rows = await db()
    .select({ a: eightKFilings.accessionNumber })
    .from(eightKFilings)
    .where(inArray(eightKFilings.accessionNumber, accns));
  return new Set(rows.map((r) => r.a));
}

/** Sync one symbol's recent 8-Ks. Best-effort (no CIK / no filings → log + skip). */
export async function sync8KForSymbol(
  symbol: string,
  cikMap?: Map<string, { cik: string; name: string }>,
): Promise<{ symbol: string; cik: string | null; filings: number; inserted: number }> {
  const sym = symbol.trim().toUpperCase();
  const map = cikMap ?? (await fetchCompanyTickers());
  const entry = map.get(sym);
  if (!entry) {
    log.warn("8k.sync.no_cik", { symbol: sym }); // ticker not in SEC directory (foreign/ETF/format mismatch)
    return { symbol: sym, cik: null, filings: 0, inserted: 0 };
  }
  const all = await fetch8KFilings(Number(entry.cik));
  if (!all) {
    log.warn("8k.sync.empty", { symbol: sym, cik: entry.cik });
    return { symbol: sym, cik: entry.cik, filings: 0, inserted: 0 };
  }

  const cutoff = isoDaysAgo(LOOKBACK_DAYS);
  const candidates = all.filter((f) => f.filedDate >= cutoff).slice(0, MAX_FILINGS_PER_SYMBOL);
  const existing = await existingAccessions(candidates.map((f) => f.accessionNumber));
  const fresh = candidates.filter((f) => !existing.has(f.accessionNumber));

  let inserted = 0;
  for (const f of fresh) {
    try {
      await db()
        .insert(eightKFilings)
        .values({
          accessionNumber: f.accessionNumber,
          cik: entry.cik,
          symbol: sym,
          items: f.items,
          filedDate: f.filedDate,
          reportDate: f.reportDate,
          primaryDocument: f.primaryDocument || null,
          // PIT: acceptance datetime (when it went public); fall back to filing date.
          knownAt: knownAtFor(f.acceptedAt, f.filedDate),
        })
        .onConflictDoNothing({ target: eightKFilings.accessionNumber }); // 8-K is immutable
      inserted++;
    } catch (err) {
      log.warn("8k.sync.filing_failed", { symbol: sym, accn: f.accessionNumber, error: err instanceof Error ? err.message : String(err) });
    }
  }
  log.info("8k.sync.symbol", { symbol: sym, candidates: candidates.length, inserted });
  return { symbol: sym, cik: entry.cik, filings: candidates.length, inserted };
}

/** Sync 8-Ks for the whole tracked universe (cron entry point). Fetches the
 *  ticker→CIK directory once, then iterates serially (global SEC throttle). */
export async function sync8KAll(): Promise<{ symbols: number; inserted: number; noCik: number }> {
  const cikMap = await fetchCompanyTickers();
  const syms = await db().select({ symbol: universe.symbol }).from(universe).orderBy(universe.symbol);
  let inserted = 0;
  let noCik = 0;
  for (const s of syms) {
    try {
      const res = await sync8KForSymbol(s.symbol, cikMap);
      inserted += res.inserted;
      if (!res.cik) noCik++;
    } catch (err) {
      log.warn("8k.sync.symbol_failed", { symbol: s.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }
  log.info("8k.sync.done", { symbols: syms.length, inserted, noCik });
  return { symbols: syms.length, inserted, noCik };
}
