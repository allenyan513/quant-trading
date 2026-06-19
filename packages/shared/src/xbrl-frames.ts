/**
 * SEC XBRL Frames API (`data.sec.gov/api/xbrl/frames`) — one financial concept ×
 * ALL filers × one calendar period in a single call. Powers deterministic,
 * cross-sectional fundamental screening (issue #106): the data service fetches a
 * few frames, scores them market-wide, and queues discovery candidates.
 *
 * Companies tag the same line under different us-gaap concepts (Revenues vs
 * RevenueFromContractWithCustomerExcludingAssessedTax …), so a single tag misses
 * hundreds of filers — `mergeFramesByCik` combines the priority list (reuse
 * `INCOME_CONCEPTS` from edgar.ts) first-tag-wins-per-cik, mirroring edgar.ts
 * `resolve()`. The scorers are pure (unit-tested); only the fetchers do I/O, via
 * the shared `secGet` throttle. No DB here.
 */
import { secGet } from "./sec-http.js";

const FRAMES_BASE = "https://data.sec.gov/api/xbrl/frames/us-gaap";

/** One datum in a frame: a single fact for one filer in the calendar period. */
export interface FramePoint {
  accn: string;
  cik: number;
  entityName: string;
  start?: string; // duration concepts only
  end: string;
  val: number;
}

export interface FrameResponse {
  taxonomy: string;
  tag: string;
  label?: string;
  pts: number;
  data: FramePoint[];
}

/** A concept's value for one cik after alt-tag merge (`tag` = which alt won). */
export interface MergedValue {
  val: number;
  end: string;
  entityName: string;
  tag: string;
}
export type MergedFrame = Map<number, MergedValue>; // keyed by cik

export interface GrowthScore {
  cik: number;
  valNow: number;
  valAgo: number;
  growth: number; // (now - ago) / ago
  entityName: string;
}

// ───────────────────────── pure: period helpers ─────────────────────────

/** "CY2025Q3" → "CY2024Q3" (same quarter, prior year) for a YoY comparison. */
export function priorYear(period: string): string {
  return period.replace(/^CY(\d{4})(Q[1-4])$/, (_m, y: string, q: string) => `CY${Number(y) - 1}${q}`);
}

/**
 * The most recent calendar quarter that's settled enough for Frames to be
 * populated (10-Q deadlines + aggregation lag) as of `today`. `lagDays` is the
 * settle margin; the result is the last quarter fully completed before `today −
 * lagDays`. NOTE: Q4 *duration* frames are sparse (companies report the full year
 * in the 10-K, not a standalone Q4) — prefer Q1–Q3 for quarterly-revenue screens,
 * or pass an explicit `period`.
 */
export function settledPeriod(today: Date, lagDays = 75): string {
  const c = new Date(today.getTime() - lagDays * 86_400_000);
  const quarterIn = Math.floor(c.getUTCMonth() / 3) + 1; // 1..4 — the quarter the cutoff falls in
  let q = quarterIn - 1; // most recent quarter fully completed before the cutoff
  let y = c.getUTCFullYear();
  if (q === 0) {
    q = 4;
    y -= 1;
  }
  return `CY${y}Q${q}`;
}

// ───────────────────────── pure: merge + score ─────────────────────────

/**
 * Combine alt-tag frames (in priority order) into one cik→value map. The first
 * tag that carries a value for a cik wins (mirrors edgar.ts `resolve()`), which
 * closes the per-tag coverage gap. `null` frames (sparse/404) are skipped.
 */
export function mergeFramesByCik(frames: { tag: string; resp: FrameResponse | null }[]): MergedFrame {
  const merged: MergedFrame = new Map();
  for (const { tag, resp } of frames) {
    if (!resp?.data) continue;
    for (const p of resp.data) {
      if (typeof p.cik !== "number" || typeof p.val !== "number") continue;
      if (merged.has(p.cik)) continue; // a higher-priority tag already supplied this cik
      merged.set(p.cik, { val: p.val, end: p.end, entityName: p.entityName, tag });
    }
  }
  return merged;
}

/**
 * YoY growth per cik. Inner-join on cik (must be in both frames — non-calendar
 * fiscal years land in adjacent frames and are dropped, acceptable for a screen).
 * Size floor: drop `valAgo < minBase` (micro-cap 0→tiny noise) and `valAgo <= 0`
 * (negative/zero base makes a growth % meaningless).
 */
export function scoreYoyGrowth(now: MergedFrame, ago: MergedFrame, opts: { minBase: number }): GrowthScore[] {
  const out: GrowthScore[] = [];
  for (const [cik, n] of now) {
    const a = ago.get(cik);
    if (!a) continue;
    if (a.val <= 0 || a.val < opts.minBase) continue;
    out.push({ cik, valNow: n.val, valAgo: a.val, growth: (n.val - a.val) / a.val, entityName: n.entityName });
  }
  return out;
}

/** Filter by a growth floor, sort desc, keep top-N. */
export function rankByGrowth(scores: GrowthScore[], opts: { topN: number; minGrowthPct?: number }): GrowthScore[] {
  const floor = opts.minGrowthPct ?? -Infinity;
  return scores
    .filter((s) => s.growth >= floor)
    .sort((a, b) => b.growth - a.growth)
    .slice(0, Math.max(0, opts.topN));
}

// ───────────────────────── thin client (I/O) ─────────────────────────

/** Fetch one concept's frame for a period. `period` is bare "CY2025Q3"; `instant`
 *  appends the "I" suffix (balance-sheet concepts). Soft-404 → null. */
export async function fetchFrame(concept: string, opts: { period: string; instant?: boolean; unit?: string }): Promise<FrameResponse | null> {
  const unit = opts.unit ?? "USD";
  const suffix = opts.instant ? "I" : "";
  return secGet<FrameResponse>(`${FRAMES_BASE}/${concept}/${unit}/${opts.period}${suffix}.json`);
}

/** Fetch every alt-tag frame for a period and merge by cik. Returns the merged
 *  map + per-tag `pts` (so a sparse/empty tag is visible in logs). */
export async function fetchMergedFrame(
  concepts: string[],
  opts: { period: string; instant?: boolean; unit?: string },
): Promise<{ merged: MergedFrame; coverage: { tag: string; pts: number }[] }> {
  const frames: { tag: string; resp: FrameResponse | null }[] = [];
  for (const concept of concepts) {
    frames.push({ tag: concept, resp: await fetchFrame(concept, opts) });
  }
  const merged = mergeFramesByCik(frames);
  const coverage = frames.map((f) => ({ tag: f.tag, pts: f.resp?.data?.length ?? 0 }));
  return { merged, coverage };
}
