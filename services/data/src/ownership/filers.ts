/**
 * The roster of activist / large-stake filers data tracks for SC 13D/13G. data
 * owns `data_ownership_filers`. Seeded idempotently on each sync (onConflictDoNothing
 * respects an `active=false` a human later set). New filers added via
 * POST /ownership/filers. Mirrors thirteenf/filers.ts.
 *
 * CIKs verified against live EDGAR submissions as the filer's CURRENT 13D/13G filing
 * entity with recent filings — activists drift between filing entities (e.g. the
 * 2009 "Starboard" predecessor CIK is dead; ValueAct's old CIK has zero 13D/13G), so
 * a name match is NOT enough. A wrong CIK simply yields no filings (sync skips it).
 */
import { eq } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";
import { padCik } from "@qt/shared/thirteenf";
import { log } from "../log.js";

const { ownershipFilers } = dbSchema;

export interface OwnershipFilerInput {
  cik: string; // any form — normalized to 10-digit padded
  name: string;
  label?: string;
}

// Starter roster — well-known activists + large-stake filers, each CIK verified to
// have recent SC 13D/13G filings. Extend at runtime via POST /ownership/filers
// (e.g. add more once their current filing CIK is confirmed).
const DEFAULT_OWNERSHIP_FILERS: OwnershipFilerInput[] = [
  { cik: "0000921669", name: "Icahn Carl C", label: "Icahn" },
  { cik: "0001791786", name: "Elliott Investment Management L.P.", label: "Elliott" },
  { cik: "0001517137", name: "Starboard Value LP", label: "Starboard" },
  { cik: "0001336528", name: "Pershing Square Capital Management", label: "Ackman" },
  { cik: "0001040273", name: "Third Point LLC", label: "Loeb" },
  { cik: "0001345471", name: "Trian Fund Management, L.P.", label: "Nelson Peltz" },
  { cik: "0001559771", name: "Engaged Capital LLC", label: "Engaged" },
  { cik: "0001582090", name: "Sachem Head Capital Management LP", label: "Sachem Head" },
  { cik: "0001998597", name: "JANA Partners Management, LP", label: "JANA" },
  { cik: "0001067983", name: "Berkshire Hathaway Inc", label: "Buffett" },
];

const normCik = (cik: string): string => padCik(Number(String(cik).replace(/\D/g, "")));

/** Idempotently insert the starter roster. Existing rows (incl. deactivated) are untouched. */
export async function ensureOwnershipFilersSeeded(): Promise<void> {
  await db()
    .insert(ownershipFilers)
    .values(DEFAULT_OWNERSHIP_FILERS.map((f) => ({ cik: normCik(f.cik), name: f.name, label: f.label })))
    .onConflictDoNothing({ target: ownershipFilers.cik });
}

export async function addOwnershipFiler(input: OwnershipFilerInput): Promise<{ cik: string }> {
  const cik = normCik(input.cik);
  if (cik === "0000000000") throw new Error(`invalid CIK (no digits): ${input.cik}`);
  await db()
    .insert(ownershipFilers)
    .values({ cik, name: input.name, label: input.label })
    .onConflictDoUpdate({ target: ownershipFilers.cik, set: { name: input.name, label: input.label, active: true } });
  log.info("ownership.filer.added", { cik, name: input.name });
  return { cik };
}

export interface OwnershipFiler {
  cik: string;
  name: string;
  label: string | null;
}

/** Active filers to pull, oldest-added first (stable order). */
export async function getActiveOwnershipFilers(): Promise<OwnershipFiler[]> {
  return db()
    .select({ cik: ownershipFilers.cik, name: ownershipFilers.name, label: ownershipFilers.label })
    .from(ownershipFilers)
    .where(eq(ownershipFilers.active, true))
    .orderBy(ownershipFilers.addedAt);
}
