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
  // Tracked roster benchmarked to dataroma.com's superinvestor list (value/quality
  // long-only stock pickers; macro/quant excluded). CIKs verified against SEC
  // submissions as the manager's CURRENT 13F-HR filing entity (predecessor CIKs
  // that stopped filing were resolved to their successor).
  { cik: "0001067983", name: "Berkshire Hathaway Inc", label: "Buffett" },
  { cik: "0001649339", name: "Scion Asset Management, LLC", label: "Burry" },
  { cik: "0001336528", name: "Pershing Square Capital Management", label: "Ackman" },
  { cik: "0001061768", name: "Baupost Group LLC", label: "Klarman" },
  { cik: "0001656456", name: "Appaloosa LP", label: "Tepper" },
  { cik: "0001040273", name: "Third Point LLC", label: "Loeb" },
  { cik: "0000921669", name: "Icahn Carl C", label: "Icahn" },
  { cik: "0001709323", name: "Himalaya Capital Management LLC", label: "Li Lu" },
  { cik: "0001112520", name: "Akre Capital Management LLC", label: "Akre" },
  { cik: "0001489933", name: "DME Capital Management, LP", label: "Einhorn" },
  { cik: "0001166559", name: "Gates Foundation Trust", label: "Gates" },
  { cik: "0001569205", name: "Fundsmith LLP", label: "Terry Smith" },
  { cik: "0001549575", name: "Dalal Street, LLC", label: "Pabrai" },
  { cik: "0000949509", name: "Oaktree Capital Management LP", label: "Howard Marks" },
  { cik: "0001759760", name: "H&H International Investment, LLC", label: "Duan Yongping" },
  { cik: "0001317588", name: "Abrams Bison Investments, LLC", label: "Abrams Bison" },
  { cik: "0001345471", name: "Trian Fund Management, L.P.", label: "Nelson Peltz" },
  { cik: "0000934639", name: "Maverick Capital Ltd", label: "Lee Ainslie" },
  { cik: "0001103804", name: "Viking Global Investors LP", label: "Viking Global" },
  { cik: "0001418814", name: "ValueAct Holdings, L.P.", label: "ValueAct" },
  { cik: "0001056831", name: "Fairholme Capital Management LLC", label: "Bruce Berkowitz" },
  { cik: "0000813917", name: "Harris Associates L P", label: "Bill Nygren" },
  { cik: "0001631664", name: "Punch Card Management L.P.", label: "Norbert Lou" },
  { cik: "0001798849", name: "Durable Capital Partners LP", label: "Henry Ellenbogen" },
  { cik: "0001115373", name: "Semper Augustus Investments Group LLC", label: "Christopher Bloomstran" },
  { cik: "0000807985", name: "Southeastern Asset Management Inc", label: "Mason Hawkins" },
  { cik: "0001553733", name: "Brave Warrior Advisors, LLC", label: "Glenn Greenberg" },
  { cik: "0001061165", name: "Lone Pine Capital LLC", label: "Stephen Mandel" },
  { cik: "0001063296", name: "Atlantic Investment Management, Inc.", label: "Alex Roepers" },
  { cik: "0001697868", name: "Valley Forge Capital Management, LP", label: "Valley Forge" },
  { cik: "0000859804", name: "Wedgewood Partners Inc", label: "David Rolfe" },
  { cik: "0001167483", name: "Tiger Global Management LLC", label: "Chase Coleman" },
  { cik: "0001559771", name: "Engaged Capital LLC", label: "Glenn Welling" },
  { cik: "0001697591", name: "CAS Investment Partners, LLC", label: "Clifford Sosin" },
  { cik: "0001631014", name: "AltaRock Partners LP", label: "AltaRock" },
  { cik: "0001641864", name: "Giverny Capital Inc.", label: "Francois Rochon" },
  { cik: "0000898382", name: "Cooperman Leon G", label: "Leon Cooperman" },
  { cik: "0001142062", name: "Van Den Berg Management I, Inc", label: "Arnold Van Den Berg" },
  { cik: "0001657335", name: "Oakcliff Capital Partners, LP", label: "Bryan Lawrence" },
  { cik: "0001135778", name: "Miller Value Partners, LLC", label: "Bill Miller" },
  { cik: "0001671657", name: "Dorsey Asset Management, LLC", label: "Pat Dorsey" },
  { cik: "0001647251", name: "TCI Fund Management Ltd", label: "Chris Hohn" },
  { cik: "0001376879", name: "AKO Capital LLP", label: "AKO Capital" },
  { cik: "0000915191", name: "Fairfax Financial Holdings Ltd", label: "Prem Watsa" },
  { cik: "0001314620", name: "Hillman Capital Management, Inc.", label: "Hillman Capital" },
  { cik: "0001454502", name: "Triple Frond Partners LLC", label: "Triple Frond" },
  { cik: "0001540866", name: "Makaira Partners LLC", label: "Tom Bancroft" },
  { cik: "0001720792", name: "Ruane, Cunniff & Goldfarb L.P.", label: "Ruane Cunniff" },
  { cik: "0001773994", name: "Conifer Management, L.L.C.", label: "Greg Alexander" },
  { cik: "0000936753", name: "Ariel Investments, LLC", label: "John Rogers" },
  { cik: "0001358706", name: "Abrams Capital Management, L.P.", label: "David Abrams" },
  { cik: "0001325447", name: "First Eagle Investment Management, LLC", label: "First Eagle" },
  { cik: "0001766908", name: "ShawSpring Partners LLC", label: "Dennis Hong" },
  { cik: "0001165797", name: "Causeway Capital Management LLC", label: "Sarah Ketterer" },
  { cik: "0000883965", name: "Weitz Investment Management, Inc.", label: "Wallace Weitz" },
  { cik: "0000200217", name: "Dodge & Cox", label: "Dodge & Cox" },
  { cik: "0001389403", name: "Chou Associates Management Inc.", label: "Francis Chou" },
  { cik: "0001854794", name: "Patient Capital Management, LLC", label: "Samantha McLemore" },
  { cik: "0001034524", name: "Polen Capital Management LLC", label: "Polen Capital" },
  { cik: "0001377581", name: "First Pacific Advisors, LP", label: "First Pacific Advisors" },
  { cik: "0001070134", name: "Mairs & Power Inc", label: "Mairs & Power" },
  { cik: "0001099281", name: "Third Avenue Management LLC", label: "Third Avenue" },
  { cik: "0001581811", name: "Egerton Capital (UK) LLP", label: "John Armitage" },
  { cik: "0000860643", name: "Gardner Russo & Quinn LLC", label: "Thomas Russo" },
  { cik: "0001556785", name: "Vulcan Value Partners, LLC", label: "Vulcan Value" },
  { cik: "0001766596", name: "RV Capital AG", label: "Robert Vinall" },
  { cik: "0001766504", name: "Greenlea Lane Capital Management, LLC", label: "Josh Tarasoff" },
  { cik: "0001039565", name: "Kahn Brothers Group Inc", label: "Kahn Brothers" },
  { cik: "0000820124", name: "Sound Shore Management Inc", label: "Harry Burn" },
  { cik: "0001279936", name: "Cantillon Capital Management LLC", label: "William Von Mueffling" },
  { cik: "0001036325", name: "Davis Selected Advisers", label: "Christopher Davis" },
  { cik: "0000732905", name: "Tweedy, Browne Co LLC", label: "Tweedy Browne" },
  { cik: "0001106129", name: "Jensen Investment Management Inc", label: "Jensen" },
  { cik: "0001096343", name: "Markel Group Inc.", label: "Thomas Gayner" },
  { cik: "0000098758", name: "Torray Investment Partners LLC", label: "Torray" },
  { cik: "0000905567", name: "Yacktman Asset Management LP", label: "Yacktman" },
  { cik: "0001484150", name: "Lindsell Train Ltd", label: "Lindsell Train" },
  { cik: "0001027796", name: "Pzena Investment Management LLC", label: "Richard Pzena" },
  { cik: "0001016287", name: "Matrix Asset Advisors Inc", label: "David Katz" },
  { cik: "0000947996", name: "Olstein Capital Management, L.P.", label: "Robert Olstein" },
  { cik: "0002104187", name: "Aquamarine Financial (Cayman) Ltd", label: "Guy Spier" },
  { cik: "0000846222", name: "Greenhaven Associates Inc", label: "Greenhaven" },
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
  // Reject a CIK with no digits — normCik would otherwise write the all-zero
  // sentinel "0000000000" and pollute the roster with a junk filer.
  if (cik === "0000000000") throw new Error(`invalid CIK (no digits): ${input.cik}`);
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
