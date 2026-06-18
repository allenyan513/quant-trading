/**
 * Holdings export for the MCP `get_holdings` tool — reads the data_holdings_*
 * tables (the signed-in user's IBKR account) and returns a compact, LLM-friendly
 * JSON: current positions, recent trades, performance (NAV index + KPIs vs SPY).
 * Read-only. Moved from services/data so MCP lives on web; web reads the read-only
 * DB directly (the dashboard already reads these same tables).
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dbSchema, metrics, type DailyReturn } from "@qt/shared";

const { holdingsAccounts, holdingsNavHistory, holdingsTrades, holdingsPositions, dailyPrices } = dbSchema;

// Risk-free rate read statically (Next only inlines static process.env access; a
// dynamic config.riskFreeRate() would read empty in a route handler). Falls back
// to the same default config uses.
const riskFreeRate = (): number => Number(process.env.RISK_FREE_RATE ?? "0.043");

export const HOLDINGS_SECTIONS = ["performance", "positions", "trades"] as const;
export type HoldingsSection = (typeof HOLDINGS_SECTIONS)[number];

export interface HoldingsExportOpts {
  sections?: HoldingsSection[];
  tradesLimit?: number;
}

/** NAV index + the full KPI set (CAGR/Sharpe/…/Beta/Alpha vs SPY). */
async function computePerformance(accountId: string) {
  const navRows = await db()
    .select({
      date: holdingsNavHistory.date,
      navIndex: holdingsNavHistory.navIndex,
      dailyReturn: holdingsNavHistory.dailyReturn,
      endingNav: holdingsNavHistory.endingNav,
    })
    .from(holdingsNavHistory)
    .where(eq(holdingsNavHistory.accountId, accountId))
    .orderBy(holdingsNavHistory.date);
  // Need ≥2 points for any return-based metric (stdev uses N-1); with 0/1 row
  // every KPI is null anyway, so short-circuit (also skips the SPY fetch).
  if (navRows.length < 2) {
    const last = navRows[0];
    return {
      tradingDays: navRows.length,
      asOf: last?.date ?? null,
      navIndex: last?.navIndex ?? null,
      endingNav: last?.endingNav ?? null,
      kpis: null,
    };
  }

  const first = navRows[0]!;
  const last = navRows[navRows.length - 1]!;
  const rf = riskFreeRate();
  const portReturns: DailyReturn[] = navRows.map((r) => ({ date: r.date, r: r.dailyReturn }));
  const navSeries = navRows.map((r) => ({ date: r.date, nav: r.navIndex }));
  const spyRows = await db()
    .select({ date: dailyPrices.tradeDate, close: dailyPrices.close })
    .from(dailyPrices)
    .where(and(eq(dailyPrices.symbol, "SPY"), gte(dailyPrices.tradeDate, first.date)))
    .orderBy(dailyPrices.tradeDate);
  const spyReturns = metrics.pricesToReturns(
    spyRows.filter((r) => r.close != null).map((r) => ({ date: r.date, close: r.close as number })),
  );
  const aligned = metrics.alignSeries(portReturns, spyReturns);
  const b = metrics.beta(aligned.a, aligned.b);

  return {
    tradingDays: navRows.length,
    asOf: last.date,
    navIndex: last.navIndex, // base 100 at inception
    endingNav: last.endingNav, // raw $ end-of-day NAV
    kpis: {
      cagr: metrics.cagr(first.navIndex, last.navIndex, navRows.length),
      volatility: metrics.annualizedVolatility(portReturns),
      sharpe: metrics.sharpe(portReturns, rf),
      sortino: metrics.sortino(portReturns, rf),
      maxDrawdown: metrics.maxDrawdown(navSeries)?.maxDD ?? null,
      calmar: metrics.calmar(navSeries),
      beta: b,
      alpha: metrics.alpha(aligned.a, aligned.b, rf),
      informationRatio: metrics.informationRatio(aligned.a, aligned.b),
      treynor: b != null ? metrics.treynor(portReturns, rf, b) : null,
    },
  };
}

type PositionRow = typeof holdingsPositions.$inferSelect;

/** Drop the sentinel option fields for non-options; keep greeks for OPT. */
function compactPosition(p: PositionRow) {
  const base = {
    symbol: p.symbol,
    assetClass: p.assetClass,
    quantity: p.quantity,
    marketValue: p.positionValue,
    weightPct: p.weightPct,
    avgPrice: p.avgPrice,
    markPrice: p.markPrice,
  };
  if (p.assetClass !== "OPT") return base;
  return { ...base, optionType: p.optionType, strike: p.strike, expiry: p.expiry, delta: p.delta, gamma: p.gamma, theta: p.theta, vega: p.vega };
}

/** Latest snapshot, longs → shorts → cash by signed weight. */
async function latestPositions(accountId: string) {
  const latest = await db()
    .select({ d: sql<string>`max(${holdingsPositions.asOfDate})` })
    .from(holdingsPositions)
    .where(eq(holdingsPositions.accountId, accountId));
  const asOf = latest[0]?.d ?? null;
  if (!asOf) return { asOf: null, positions: [] };
  const rows = await db()
    .select()
    .from(holdingsPositions)
    .where(and(eq(holdingsPositions.accountId, accountId), eq(holdingsPositions.asOfDate, asOf)));
  const sorted = rows.sort((a, b) => {
    const ca = a.assetClass === "CASH" ? 1 : 0;
    const cb = b.assetClass === "CASH" ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return (b.weightPct ?? 0) - (a.weightPct ?? 0);
  });
  return { asOf, positions: sorted.map(compactPosition) };
}

type TradeRow = typeof holdingsTrades.$inferSelect;

async function recentTrades(accountId: string, limit: number) {
  const rows = await db()
    .select()
    .from(holdingsTrades)
    .where(eq(holdingsTrades.accountId, accountId))
    .orderBy(desc(holdingsTrades.tradeDate), desc(holdingsTrades.externalTradeId))
    .limit(limit);
  return rows.map((t: TradeRow) => {
    const base = { tradeDate: t.tradeDate, symbol: t.symbol, assetClass: t.assetClass, action: t.action, quantity: t.quantity, price: t.price };
    return t.assetClass === "OPT" ? { ...base, optionType: t.optionType, strike: t.strike, expiry: t.expiry } : base;
  });
}

/**
 * Build the holdings export for the single configured account. Returns
 * `{ connected:false, note }` when no Flex credentials are saved yet, so an LLM
 * gets an actionable message instead of empty sections.
 */
export async function getHoldingsExport(accountId: string, opts: HoldingsExportOpts = {}) {
  const sections = opts.sections?.length ? opts.sections : [...HOLDINGS_SECTIONS];

  const acct = (
    await db()
      .select({ queryId: holdingsAccounts.flexQueryId })
      .from(holdingsAccounts)
      .where(eq(holdingsAccounts.accountId, accountId))
      .limit(1)
  )[0];

  const result: Record<string, unknown> = { accountId, connected: !!acct };
  // Advisory only — still return any already-synced data even if creds were
  // since removed (don't hide a real snapshot behind the credentials check).
  if (!acct) {
    result.note =
      "No IBKR Flex credentials saved — connect at /data/holdings/settings and sync to refresh. Showing last-synced data if any.";
  }
  if (sections.includes("performance")) result.performance = await computePerformance(accountId);
  if (sections.includes("positions")) result.positions = await latestPositions(accountId);
  if (sections.includes("trades")) result.trades = await recentTrades(accountId, Math.min(opts.tradesLimit ?? 50, 200));
  return result;
}
