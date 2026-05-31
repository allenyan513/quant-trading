// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// Historical Multiples Computation
// Shared logic for computing P/E, EV/EBITDA from price + financials
// Used by both the API route and the SSR data layer
// ============================================================

import type {
  HistoricalMultiplesPoint,
  MultipleStats,
  FinancialStatement,
} from "../types.js";

interface DailyPrice {
  date: string;
  close: number;
}

// --- Core: compute historical multiples from prices + financials ---

export function computeHistoricalMultiples(
  financials: FinancialStatement[],
  prices: DailyPrice[]
): HistoricalMultiplesPoint[] {
  if (financials.length === 0 || prices.length === 0) return [];

  const sortedFinancials = [...financials].sort(
    (a, b) => a.fiscal_year - b.fiscal_year
  );

  const result: HistoricalMultiplesPoint[] = [];

  for (const price of prices) {
    const priceDate = new Date(price.date);
    const priceYear = priceDate.getFullYear();
    const priceMonth = priceDate.getMonth();

    const fin = findApplicableFinancial(sortedFinancials, priceYear, priceMonth);
    if (!fin) continue;

    const shares = fin.shares_outstanding;
    if (!shares || shares <= 0) continue;

    const marketCap = price.close * shares;
    const eps = fin.eps_diluted || fin.eps;
    const pe = eps > 0 ? price.close / eps : null;

    // EV-based multiples: EV = Market Cap + Total Debt - Cash
    const totalDebt = fin.total_debt || 0;
    const cash = fin.cash_and_equivalents || 0;
    const ev = marketCap + totalDebt - cash;
    const ebitda = fin.ebitda || 0;
    const evEbitda = ebitda > 0 && ev > 0 ? ev / ebitda : null;

    result.push({
      date: price.date,
      pe: pe !== null && pe > 0 && pe < 200 ? Math.round(pe * 100) / 100 : null,
      ev_ebitda: evEbitda !== null && evEbitda > 0 && evEbitda < 100 ? Math.round(evEbitda * 100) / 100 : null,
    });
  }

  return result;
}

// --- Statistics: compute avg, p25, p75, percentile for each multiple ---

const CAPS: Record<string, number> = { pe: 200, ev_ebitda: 100 };

function computeStats(
  values: number[],
  cap: number
): MultipleStats | null {
  const valid = values.filter((v) => v > 0 && v < cap);
  if (valid.length < 10) return null;

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = valid.reduce((a, b) => a + b, 0);
  const avg = sum / valid.length;
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const current = valid[valid.length - 1]; // most recent

  // Percentile: what % of historical values are below current
  const belowCount = sorted.filter((v) => v < current).length;
  const percentile = Math.round((belowCount / sorted.length) * 100);

  return {
    current: Math.round(current * 100) / 100,
    avg5y: Math.round(avg * 100) / 100,
    p25: Math.round(p25 * 100) / 100,
    p75: Math.round(p75 * 100) / 100,
    percentile,
    dataPoints: valid.length,
  };
}

export function computeMultiplesStats(data: HistoricalMultiplesPoint[]) {
  return {
    pe: computeStats(
      data.map((d) => d.pe).filter((v): v is number => v !== null),
      CAPS.pe
    ),
    ev_ebitda: computeStats(
      data.map((d) => d.ev_ebitda).filter((v): v is number => v != null),
      CAPS.ev_ebitda
    ),
  };
}

// --- Helpers ---

function findApplicableFinancial(
  financials: FinancialStatement[],
  priceYear: number,
  priceMonth: number
): FinancialStatement | null {
  const availableFY = priceMonth >= 3 ? priceYear - 1 : priceYear - 2;
  let best: FinancialStatement | null = null;
  for (const f of financials) {
    if (f.fiscal_year <= availableFY) {
      if (!best || f.fiscal_year > best.fiscal_year) {
        best = f;
      }
    }
  }
  return best;
}

export function sampleData(
  data: HistoricalMultiplesPoint[],
  maxPoints: number
): HistoricalMultiplesPoint[] {
  if (data.length <= maxPoints) return data;
  const result: HistoricalMultiplesPoint[] = [data[0]];
  const step = (data.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(data[Math.round(i * step)]);
  }
  result.push(data[data.length - 1]);
  return result;
}