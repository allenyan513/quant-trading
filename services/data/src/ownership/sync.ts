/**
 * SC 13D/13G sync — pulls each tracked activist's beneficial-ownership filings from
 * SEC EDGAR and upserts them into `data_ownership_filings` (immutable, idempotent by
 * accession). Per filing: resolve the SUBJECT company (from the .hdr.sgml header) and
 * its ticker (cached in `data_ownership_subjects`), and best-effort the cover-page
 * cusip/%/shares. Re-runs are cheap: a filing whose accession is already stored is
 * skipped before any fetch. data owns all three tables. Mirrors thirteenf/sync.ts.
 */
import { inArray, eq } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";
import { padCik, fetchSubmissions } from "@qt/shared/thirteenf";
import {
  findOwnershipFilings,
  parseOwnershipHeader,
  parseCoverPage,
  fetchOwnershipHeader,
  fetchCoverDoc,
  fetchSubjectTicker,
  type OwnershipFiling,
} from "@qt/shared/ownership";
import { ensureOwnershipFilersSeeded, getActiveOwnershipFilers } from "./filers.js";
import { log } from "../log.js";

const { ownershipFilings, ownershipSubjects } = dbSchema;

// Cold-start bounds: don't pull a filer's entire decade of filings, and skip very
// old ones (long-exited positions add noise). Steady state is cheap anyway (the
// accession-skip below means only genuinely new filings get fetched).
const MAX_FILINGS_PER_FILER = 40;
const LOOKBACK_DAYS = 730;

const isoDaysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** Which of these accessions are already stored (→ skip re-fetching them). */
async function existingAccessions(accns: string[]): Promise<Set<string>> {
  if (accns.length === 0) return new Set();
  const rows = await db()
    .select({ a: ownershipFilings.accessionNumber })
    .from(ownershipFilings)
    .where(inArray(ownershipFilings.accessionNumber, accns));
  return new Set(rows.map((r) => r.a));
}

/** Subject CIK → ticker, cached in data_ownership_subjects (negative-cache tombstone). */
async function resolveSubjectTicker(subjectCik: string, fallbackName: string): Promise<{ ticker: string | null; name: string | null }> {
  const cached = await db()
    .select({ ticker: ownershipSubjects.ticker, name: ownershipSubjects.name })
    .from(ownershipSubjects)
    .where(eq(ownershipSubjects.cik, subjectCik))
    .limit(1);
  if (cached.length) return { ticker: cached[0]!.ticker, name: cached[0]!.name };

  const resolved = await fetchSubjectTicker(subjectCik);
  const name = resolved.name ?? fallbackName ?? null;
  await db()
    .insert(ownershipSubjects)
    .values({ cik: subjectCik, ticker: resolved.ticker, name, updatedAt: new Date() })
    .onConflictDoUpdate({ target: ownershipSubjects.cik, set: { ticker: resolved.ticker, name, updatedAt: new Date() } });
  return { ticker: resolved.ticker, name };
}

type FilingRow = typeof ownershipFilings.$inferInsert;

/** Resolve one filing into a DB row (header → subject + ticker, best-effort cover). Null = skip. */
async function buildFilingRow(numCik: number, paddedCik: string, fallbackFilerName: string, f: OwnershipFiling): Promise<FilingRow | null> {
  const sgml = await fetchOwnershipHeader(numCik, f.accessionNumber);
  if (!sgml) {
    log.warn("ownership.sync.header_missing", { cik: paddedCik, accn: f.accessionNumber });
    return null;
  }
  const header = parseOwnershipHeader(sgml);
  if (!header) {
    log.warn("ownership.sync.header_unparsed", { cik: paddedCik, accn: f.accessionNumber });
    return null; // can't make it symbol-queryable
  }
  const subject = await resolveSubjectTicker(header.subjectCik, header.subjectName);

  // Cover page is best-effort — a fetch/parse failure must not drop the filing.
  let cover = { cusip: null as string | null, pctOfClass: null as number | null, sharesOwned: null as number | null };
  try {
    const html = await fetchCoverDoc(numCik, f.accessionNumber, f.primaryDocument);
    if (html) cover = parseCoverPage(html);
  } catch (err) {
    log.warn("ownership.sync.cover_failed", { accn: f.accessionNumber, error: err instanceof Error ? err.message : String(err) });
  }

  return {
    accessionNumber: f.accessionNumber,
    filerCik: paddedCik,
    filerName: header.filerName || fallbackFilerName,
    formType: f.form,
    schedule: f.schedule,
    isAmendment: f.isAmendment,
    subjectCik: header.subjectCik,
    subjectName: header.subjectName || subject.name || "",
    subjectTicker: subject.ticker,
    cusip: cover.cusip,
    pctOfClass: cover.pctOfClass,
    sharesOwned: cover.sharesOwned,
    filedDate: f.filedDate,
    knownAt: new Date(`${f.filedDate}T00:00:00Z`),
  };
}

/** Sync one activist's 13D/13G filings. Best-effort (no filings / parse failures log + skip). */
export async function syncOwnershipForFiler(cik: string): Promise<{ cik: string; filings: number; inserted: number }> {
  const digits = String(cik).replace(/\D/g, "");
  if (!digits) {
    log.warn("ownership.sync.invalid_cik", { cik });
    return { cik, filings: 0, inserted: 0 };
  }
  const numCik = Number(digits);
  const padded = padCik(numCik);
  const subs = await fetchSubmissions(numCik);
  if (!subs) {
    log.warn("ownership.sync.empty", { cik: padded });
    return { cik: padded, filings: 0, inserted: 0 };
  }

  const cutoff = isoDaysAgo(LOOKBACK_DAYS);
  const candidates = findOwnershipFilings(subs)
    .filter((f) => f.filedDate >= cutoff)
    .slice(0, MAX_FILINGS_PER_FILER);
  const existing = await existingAccessions(candidates.map((f) => f.accessionNumber));
  const fresh = candidates.filter((f) => !existing.has(f.accessionNumber));

  let inserted = 0;
  for (const f of fresh) {
    const row = await buildFilingRow(numCik, padded, subs.name ?? "", f);
    if (!row) continue;
    await db().insert(ownershipFilings).values(row).onConflictDoUpdate({
      target: ownershipFilings.accessionNumber,
      set: {
        subjectTicker: row.subjectTicker,
        subjectName: row.subjectName,
        cusip: row.cusip,
        pctOfClass: row.pctOfClass,
        sharesOwned: row.sharesOwned,
      },
    });
    inserted++;
  }
  log.info("ownership.sync.filer", { cik: padded, candidates: candidates.length, inserted });
  return { cik: padded, filings: candidates.length, inserted };
}

/** Sync every active filer (cron entry point). Seeds the starter roster first. */
export async function syncOwnershipAll(): Promise<{ filers: number; inserted: number }> {
  await ensureOwnershipFilersSeeded();
  const filers = await getActiveOwnershipFilers();
  let inserted = 0;
  for (const f of filers) {
    const res = await syncOwnershipForFiler(f.cik);
    inserted += res.inserted;
  }
  log.info("ownership.sync.done", { filers: filers.length, inserted });
  return { filers: filers.length, inserted };
}
