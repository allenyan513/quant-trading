/**
 * 13F sync — pulls each tracked manager's most recent quarterly filings from SEC
 * EDGAR and upserts them into `data_13f_holdings` (immutable snapshots, idempotent
 * by (cik, quarter, cusip, put_call); an amendment supersedes via onConflictDoUpdate).
 * Plus the self-maintained CUSIP→ticker map writer. data owns all three tables.
 */
import { sql } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";
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
  const padded = padCik(Number(cik));
  const filings = await fetchLatest13F(Number(cik), quarters);
  if (!filings || filings.length === 0) {
    log.warn("13f.sync.empty", { cik: padded });
    return { cik: padded, quarters: 0, rows: 0 };
  }
  let rows = 0;
  for (const q of filings) rows += await upsertQuarter(padded, q);
  log.info("13f.sync.filer", { cik: padded, quarters: filings.length, rows });
  return { cik: padded, quarters: filings.length, rows };
}

/** Sync every active manager (cron entry point). Seeds the starter roster first. */
export async function sync13FAll(quarters = 2): Promise<{ filers: number; rows: number }> {
  await ensureFilersSeeded();
  const filers = await getActiveFilers();
  let rows = 0;
  for (const f of filers) {
    const res = await sync13FForFiler(f.cik, quarters);
    rows += res.rows;
  }
  log.info("13f.sync.done", { filers: filers.length, rows });
  return { filers: filers.length, rows };
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
