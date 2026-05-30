/**
 * Reference valuation (System A) — slow, fundamentals-based intrinsic value.
 * v1 is intentionally minimal: pull current price + FMP's DCF fair value, persist
 * an immutable snapshot. M4 will port value-scope's full multi-model consensus
 * (FCFF/multiples/PEG/EPV/DDM) — see legends/value-scope/src/lib/valuation.
 */
import { randomUUID } from "node:crypto";
import { fmpGet, db, dbSchema, codeVersion, type ReferenceValuation, type Verdict } from "@qt/shared";

const { valuationSnapshots } = dbSchema;

interface FmpQuote { symbol: string; price?: number | null }
interface FmpDcf { symbol: string; dcf?: number | null; "Stock Price"?: number | null }

function verdictOf(upsidePct: number | null): Verdict | null {
  if (upsidePct == null) return null;
  if (upsidePct > 15) return "undervalued";
  if (upsidePct < -15) return "overvalued";
  return "fairly_valued";
}

export async function computeReferenceValuation(symbol: string): Promise<ReferenceValuation> {
  const [quoteArr, dcfArr] = await Promise.all([
    fmpGet<FmpQuote[]>("quote", { symbol }, { softFail402: true }),
    fmpGet<FmpDcf[]>("discounted-cash-flow", { symbol }, { softFail402: true }),
  ]);
  const currentPrice = quoteArr?.[0]?.price ?? dcfArr?.[0]?.["Stock Price"] ?? null;
  const fairValue = dcfArr?.[0]?.dcf ?? null;
  const upsidePct =
    fairValue != null && currentPrice ? (fairValue / currentPrice - 1) * 100 : null;

  const snapshotId = randomUUID();
  const asOf = new Date().toISOString().slice(0, 10);
  const verdict = verdictOf(upsidePct);

  await db().insert(valuationSnapshots).values({
    snapshotId,
    symbol,
    asOf,
    fairValuePerShare: fairValue,
    currentPrice,
    upsidePct,
    verdict,
    detail: { source: "fmp_dcf", quote: quoteArr?.[0] ?? null, dcf: dcfArr?.[0] ?? null },
    codeVersion: codeVersion(),
  });

  return {
    snapshot_id: snapshotId,
    symbol,
    as_of: asOf,
    fair_value_per_share: fairValue,
    current_price: currentPrice,
    upside_pct: upsidePct,
    verdict,
    detail: { source: "fmp_dcf" },
  };
}
