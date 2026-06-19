/**
 * Form 4 sync — pulls each universe symbol's recent SEC Form 4 insider filings and
 * upserts each transaction into `data_form4` (immutable; PK accession+txnIndex). The
 * issuer's submissions feed lists its insiders' Form 4s; the ticker is in the XML.
 * Re-runs are cheap (accession already stored → skipped before fetch). Direct-from-SEC
 * replacement for the FMP insider path (which stays as a read-time fallback). data
 * owns the table. Mirrors eightk/sync.ts.
 */
import { inArray } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";
import { fetchCompanyTickers } from "@qt/shared/edgar-8k";
import { fetchSubmissions, find4Filings, parseForm4, fetch4Xml } from "@qt/shared/form4";
import { log } from "../log.js";

const { form4Transactions, universe } = dbSchema;

// Form 4s are frequent (Apple files hundreds/yr) — bound the cold ingest hard;
// accession-skip keeps re-runs cheap.
const MAX_FILINGS_PER_SYMBOL = 30;
const LOOKBACK_DAYS = 365;

const isoDaysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** PIT timestamp: acceptance datetime when valid, else fall back to filing date. */
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
    .selectDistinct({ a: form4Transactions.accessionNumber })
    .from(form4Transactions)
    .where(inArray(form4Transactions.accessionNumber, accns));
  return new Set(rows.map((r) => r.a));
}

/** Sync one symbol's recent Form 4s. Best-effort (no CIK / no filings → log + skip). */
export async function syncForm4ForSymbol(
  symbol: string,
  cikMap?: Map<string, { cik: string; name: string }>,
): Promise<{ symbol: string; cik: string | null; filings: number; inserted: number }> {
  const sym = symbol.trim().toUpperCase();
  const map = cikMap ?? (await fetchCompanyTickers());
  const entry = map.get(sym);
  if (!entry) {
    log.warn("form4.sync.no_cik", { symbol: sym });
    return { symbol: sym, cik: null, filings: 0, inserted: 0 };
  }
  const subs = await fetchSubmissions(Number(entry.cik));
  if (!subs) {
    log.warn("form4.sync.empty", { symbol: sym, cik: entry.cik });
    return { symbol: sym, cik: entry.cik, filings: 0, inserted: 0 };
  }

  const cutoff = isoDaysAgo(LOOKBACK_DAYS);
  const candidates = find4Filings(subs).filter((f) => f.filedDate >= cutoff).slice(0, MAX_FILINGS_PER_SYMBOL);
  const existing = await existingAccessions(candidates.map((f) => f.accessionNumber));
  const fresh = candidates.filter((f) => !existing.has(f.accessionNumber));

  let inserted = 0;
  for (const f of fresh) {
    // Isolate one filing's failure (SEC timeout / odd XML) so the rest still sync.
    try {
      const xml = await fetch4Xml(Number(entry.cik), f.accessionNumber);
      if (!xml) continue;
      const parsed = parseForm4(xml);
      if (!parsed || parsed.transactions.length === 0) continue;
      const owner = parsed.owners[0];
      const knownAt = knownAtFor(f.acceptedAt, f.filedDate);
      const rows = parsed.transactions.map((t, i) => ({
        accessionNumber: f.accessionNumber,
        txnIndex: i,
        symbol: parsed.symbol ?? sym,
        issuerCik: parsed.issuerCik ?? entry.cik,
        reportingName: parsed.owners.map((o) => o.name).filter(Boolean).join(", ") || (owner?.name ?? "Unknown"),
        reportingCik: owner?.cik ?? null,
        relationship: owner?.relationship ?? null,
        officerTitle: owner?.officerTitle ?? null,
        transactionCode: t.code,
        acquiredDisposed: t.acquiredDisposed,
        shares: t.shares,
        pricePerShare: t.price,
        securityTitle: t.securityTitle,
        isDerivative: t.isDerivative,
        sharesOwnedAfter: t.sharesOwnedAfter,
        is10b5_1: parsed.is10b5_1,
        transactionDate: t.transactionDate,
        filedDate: f.filedDate,
        knownAt,
      }));
      await db().insert(form4Transactions).values(rows).onConflictDoNothing(); // immutable
      inserted += rows.length;
    } catch (err) {
      log.warn("form4.sync.filing_failed", { symbol: sym, accn: f.accessionNumber, error: err instanceof Error ? err.message : String(err) });
    }
  }
  log.info("form4.sync.symbol", { symbol: sym, candidates: candidates.length, inserted });
  return { symbol: sym, cik: entry.cik, filings: candidates.length, inserted };
}

/** Sync Form 4s for the whole tracked universe (cron entry point). */
export async function syncForm4All(): Promise<{ symbols: number; inserted: number; noCik: number }> {
  const cikMap = await fetchCompanyTickers();
  const syms = await db().select({ symbol: universe.symbol }).from(universe).orderBy(universe.symbol);
  let inserted = 0;
  let noCik = 0;
  for (const s of syms) {
    try {
      const res = await syncForm4ForSymbol(s.symbol, cikMap);
      inserted += res.inserted;
      if (!res.cik) noCik++;
    } catch (err) {
      log.warn("form4.sync.symbol_failed", { symbol: s.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }
  log.info("form4.sync.done", { symbols: syms.length, inserted, noCik });
  return { symbols: syms.length, inserted, noCik };
}
