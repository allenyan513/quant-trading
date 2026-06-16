/**
 * The roster of 13F managers data tracks. data owns `data_13f_filers`. A starter
 * set of well-known managers is seeded idempotently on each sync (onConflictDoNothing
 * respects an `active=false` a human later set — it won't resurrect a deactivated
 * filer). New managers are added via POST /13f/filers; CIKs are SEC's filer ids.
 */
import { eq } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";
import { padCik } from "@qt/shared/thirteenf";
import { log } from "../log.js";

const { thirteenFFilers } = dbSchema;

export interface FilerInput {
  cik: string; // any form — normalized to 10-digit padded
  name: string;
  label?: string;
}

// Starter roster. CIKs are editable/extendable at runtime; a wrong one simply
// yields no filings (the sync skips it, no crash) and can be corrected via the
// add-filer endpoint.
const DEFAULT_FILERS: FilerInput[] = [
  { cik: "0001067983", name: "Berkshire Hathaway Inc", label: "Buffett" },
  { cik: "0001649339", name: "Scion Asset Management, LLC", label: "Burry" },
  { cik: "0001336528", name: "Pershing Square Capital Management", label: "Ackman" },
  { cik: "0001061768", name: "Baupost Group LLC", label: "Klarman" },
  { cik: "0001350694", name: "Bridgewater Associates, LP", label: "Dalio" },
];

const normCik = (cik: string): string => padCik(Number(String(cik).replace(/\D/g, "")));

/** Idempotently insert the starter roster. Existing rows (incl. deactivated) are untouched. */
export async function ensureFilersSeeded(): Promise<void> {
  await db()
    .insert(thirteenFFilers)
    .values(DEFAULT_FILERS.map((f) => ({ cik: normCik(f.cik), name: f.name, label: f.label })))
    .onConflictDoNothing({ target: thirteenFFilers.cik });
}

export async function addFiler(input: FilerInput): Promise<{ cik: string }> {
  const cik = normCik(input.cik);
  await db()
    .insert(thirteenFFilers)
    .values({ cik, name: input.name, label: input.label })
    .onConflictDoUpdate({
      target: thirteenFFilers.cik,
      set: { name: input.name, label: input.label, active: true },
    });
  log.info("13f.filer.added", { cik, name: input.name });
  return { cik };
}

export interface Filer {
  cik: string;
  name: string;
  label: string | null;
}

/** Active managers to pull, oldest-added first (stable order). */
export async function getActiveFilers(): Promise<Filer[]> {
  const rows = await db()
    .select({ cik: thirteenFFilers.cik, name: thirteenFFilers.name, label: thirteenFFilers.label })
    .from(thirteenFFilers)
    .where(eq(thirteenFFilers.active, true))
    .orderBy(thirteenFFilers.addedAt);
  return rows;
}
