/**
 * IBKR Flex brokerage sync — ported from legends/value-scope's portfolio-sync,
 * simplified for a single account (the maintainer's own) on Drizzle/Postgres.
 *
 * `/jobs/sync-holdings` fetches the live Flex statement, then upserts three things
 * into the data_holdings_* tables: a daily NAV row (TWR → base-100 nav_index),
 * executed trades (idempotent per broker trade id), and the current positions
 * snapshot (lot-aggregated, with a synthetic CASH row). It also warms the SPY
 * benchmark into data_daily_prices for the NAV-vs-SPY chart.
 *
 * Money is stored raw (repo convention); nav_index/daily_return are derived for
 * the chart + performance metrics. No disclosure lag, no per-tenant credentials.
 */
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import {
  db,
  dbSchema,
  marketdata,
  fetchFlexStatement,
  OPTION_CONTRACT_MULTIPLIER,
  type FlexStatement,
  type FlexNavRow,
  type FlexEquityRow,
  type FlexTradeRow,
  type FlexPositionRow,
  type FlexCashRow,
} from "@qt/shared";
import { getHoldingsFlexConfig } from "./credentials.js";
import { log } from "../log.js";

const { holdingsNavHistory, holdingsTrades, holdingsPositions, holdingsAccounts } = dbSchema;

/** Reference the conflicting INSERT row's column in an ON CONFLICT DO UPDATE set. */
const ex = (col: string) => sql.raw(`excluded.${col}`);

export interface HoldingsSyncResult {
  accountId: string;
  navRowsUpserted: number;
  tradesInserted: number;
  positionsUpserted: number;
  spyRows: number;
}

// ─────────────────────────── pure helpers ───────────────────────────

/**
 * Compound a series of daily returns onto a starting index, returning each
 * successive cumulative index value (nav_index_t = nav_index_{t-1} * (1 + r_t)).
 */
export function computeNavIndexChain(priorIndex: number, dailyReturns: readonly number[]): number[] {
  const out: number[] = [];
  let running = priorIndex;
  for (const r of dailyReturns) {
    running = running * (1 + r);
    out.push(running);
  }
  return out;
}

/**
 * Daily TWR return. IBKR already computes TWR in the Change-in-NAV row as a
 * percent (e.g. 1.397 = +1.397%), so when present we trust it; otherwise fall
 * back to (endingNav - startingNav - depositsWithdrawals) / startingNav.
 */
export function computeDailyReturn(row: FlexNavRow): number {
  if (Number.isFinite(row.twrPct) && row.twrPct !== 0) {
    return row.twrPct / 100;
  }
  const denom = row.startingNav;
  if (denom <= 0) return 0;
  return (row.endingNav - row.startingNav - row.depositsWithdrawals) / denom;
}

/**
 * Convert a daily NAV-in-base series into day-over-day simple returns. The first
 * row seeds the cumulative chain rather than producing its own return row.
 */
export function equityToFlexNav(equity: readonly FlexEquityRow[]): FlexNavRow[] {
  if (equity.length < 2) return [];
  const sorted = [...equity].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: FlexNavRow[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.totalNav;
    const cur = sorted[i]!.totalNav;
    if (prev <= 0) continue;
    const dailyReturnFrac = (cur - prev) / prev;
    out.push({
      date: sorted[i]!.date,
      startingNav: prev,
      endingNav: cur,
      mtmPnl: cur - prev,
      depositsWithdrawals: 0,
      // Encode the computed return in twrPct so computeDailyReturn picks it up.
      twrPct: dailyReturnFrac * 100,
    });
  }
  return out;
}

/**
 * Dollar market value of a position. Options apply the 100x contract multiplier;
 * everything else is qty × markPrice. Falls back to IBKR's pre-computed
 * positionValue when markPrice is absent so the column is never null.
 */
export function computePositionMarketValue(p: {
  assetClass: string;
  quantity: number;
  markPrice?: number;
  positionValue: number;
}): number {
  const multiplier = p.assetClass === "OPT" ? OPTION_CONTRACT_MULTIPLIER : 1;
  return p.markPrice != null ? p.markPrice * multiplier * p.quantity : p.positionValue;
}

/** Position weight as % of NAV from its dollar market value. 0 when NAV unknown. */
export function computePositionWeightPct(marketValue: number, navBase: number | null): number {
  return navBase ? (marketValue / navBase) * 100 : 0;
}

function avgOrKeep(prev: number | undefined, next: number | undefined, prevCount: number): number | undefined {
  if (prev == null) return next;
  if (next == null) return prev;
  return (prev * prevCount + next) / (prevCount + 1);
}

// ─────────────────────────── DB writers ───────────────────────────

async function loadLastNavIndex(accountId: string, beforeDate: string): Promise<number> {
  const rows = await db()
    .select({ navIndex: holdingsNavHistory.navIndex })
    .from(holdingsNavHistory)
    .where(and(eq(holdingsNavHistory.accountId, accountId), lt(holdingsNavHistory.date, beforeDate)))
    .orderBy(desc(holdingsNavHistory.date))
    .limit(1);
  return rows[0]?.navIndex ?? 100;
}

async function upsertNavRows(accountId: string, rows: FlexNavRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const earliestDate = sorted[0]!.date;
  const latestDate = sorted[sorted.length - 1]!.date;
  const priorIndex = await loadLastNavIndex(accountId, earliestDate);

  const dailyReturns = sorted.map(computeDailyReturn);
  const indices = computeNavIndexChain(priorIndex, dailyReturns);
  const runningIndex = indices[indices.length - 1] ?? priorIndex;

  const payload = sorted.map((r, i) => {
    // IBKR gives one signed depositsWithdrawals; split into two columns.
    const flow = r.depositsWithdrawals;
    return {
      accountId,
      date: r.date,
      dailyReturn: dailyReturns[i]!,
      navIndex: indices[i]!,
      endingNav: r.endingNav,
      deposits: flow > 0 ? flow : 0,
      withdrawals: flow < 0 ? -flow : 0,
    };
  });

  await db()
    .insert(holdingsNavHistory)
    .values(payload)
    .onConflictDoUpdate({
      target: [holdingsNavHistory.accountId, holdingsNavHistory.date],
      set: {
        dailyReturn: ex("daily_return"),
        navIndex: ex("nav_index"),
        endingNav: ex("ending_nav"),
        deposits: ex("deposits"),
        withdrawals: ex("withdrawals"),
      },
    });

  // Existing rows after latestDate now have a stale cumulative index — rebuild
  // them by compounding their stored daily_return from the batch's final index.
  // Daily-incremental syncs short-circuit (no following rows).
  const trailingRebuilt = await rebuildNavIndexAfter(accountId, latestDate, runningIndex);
  return payload.length + trailingRebuilt;
}

async function rebuildNavIndexAfter(accountId: string, afterDate: string, seedIndex: number): Promise<number> {
  const rows = await db()
    .select({ date: holdingsNavHistory.date, dailyReturn: holdingsNavHistory.dailyReturn })
    .from(holdingsNavHistory)
    .where(and(eq(holdingsNavHistory.accountId, accountId), gt(holdingsNavHistory.date, afterDate)))
    .orderBy(holdingsNavHistory.date);
  if (rows.length === 0) return 0;

  const indices = computeNavIndexChain(seedIndex, rows.map((r) => r.dailyReturn));
  // Single batched upsert (not N round-trips): every row already exists, so this
  // only takes the conflict branch and rewrites nav_index. daily_return is
  // re-echoed to satisfy NOT NULL on the (never-taken) insert branch but is not
  // in `set`, so the stored value + cash-flow columns are preserved.
  const payload = rows.map((r, i) => ({
    accountId,
    date: r.date,
    dailyReturn: r.dailyReturn,
    navIndex: indices[i]!,
  }));
  await db()
    .insert(holdingsNavHistory)
    .values(payload)
    .onConflictDoUpdate({
      target: [holdingsNavHistory.accountId, holdingsNavHistory.date],
      set: { navIndex: ex("nav_index") },
    });
  return rows.length;
}

async function upsertTrades(accountId: string, rows: FlexTradeRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((t) => ({
    accountId,
    externalTradeId: t.externalTradeId,
    tradeDate: t.tradeDate || null,
    symbol: t.symbol,
    assetClass: t.assetClass,
    action: t.action || null,
    quantity: t.quantity,
    price: t.price,
    optionType: t.optionType ?? null,
    strike: t.strike ?? null,
    expiry: t.expiry ?? null,
  }));
  // Trades are immutable once executed → dedup on the PK, never overwrite.
  const inserted = await db()
    .insert(holdingsTrades)
    .values(payload)
    .onConflictDoNothing({ target: [holdingsTrades.accountId, holdingsTrades.externalTradeId] })
    .returning({ externalTradeId: holdingsTrades.externalTradeId });
  return inserted.length;
}

async function upsertPositions(
  accountId: string,
  endingNav: number | undefined,
  rows: FlexPositionRow[],
  cashRows: FlexCashRow[],
): Promise<number> {
  if (rows.length === 0 && cashRows.length === 0) return 0;

  // IBKR can return multiple OpenPosition rows for the same contract (lots /
  // batched reports). Aggregate by natural key, summing value/qty and averaging
  // per-unit prices + Greeks.
  const aggregated = new Map<string, FlexPositionRow & { _count: number }>();
  for (const p of rows) {
    const key = [p.asOf, p.symbol, p.optionType ?? "", p.strike ?? "", p.expiry ?? ""].join("|");
    const existing = aggregated.get(key);
    if (!existing) {
      aggregated.set(key, { ...p, _count: 1 });
    } else {
      existing.positionValue += p.positionValue;
      existing.quantity += p.quantity;
      existing.avgPrice = avgOrKeep(existing.avgPrice, p.avgPrice, existing._count);
      existing.markPrice = avgOrKeep(existing.markPrice, p.markPrice, existing._count);
      existing.delta = avgOrKeep(existing.delta, p.delta, existing._count);
      existing.gamma = avgOrKeep(existing.gamma, p.gamma, existing._count);
      existing.theta = avgOrKeep(existing.theta, p.theta, existing._count);
      existing.vega = avgOrKeep(existing.vega, p.vega, existing._count);
      existing._count += 1;
    }
  }

  // weight_pct denominator is NAV *of that snapshot date*. A statement can carry
  // more than one reportDate (historical sync), so summing across all dates would
  // inflate NAV ~Nx and crush historical weights → compute NAV per date: the
  // account's net market value (Σ position values, shorts negative) + cash on
  // that date. IBKR's `endingNav` only applies to the latest date; otherwise fall
  // back to the per-date computed NAV so weight stays meaningful instead of 0.
  const agg = Array.from(aggregated.values());
  const navByDate = new Map<string, number>();
  for (const p of agg) navByDate.set(p.asOf, (navByDate.get(p.asOf) ?? 0) + computePositionMarketValue(p));
  for (const c of cashRows) navByDate.set(c.date, (navByDate.get(c.date) ?? 0) + c.endingCash);
  const latestDate = [...navByDate.keys()].sort().at(-1);
  const navBaseFor = (date: string): number | null => {
    if (endingNav && endingNav > 0 && date === latestDate) return endingNav;
    const v = navByDate.get(date) ?? 0;
    return v > 0 ? v : null;
  };
  const payload = agg.map((p) => {
    const positionValue = computePositionMarketValue(p);
    return {
      accountId,
      asOfDate: p.asOf,
      symbol: p.symbol,
      // Non-null sentinels so the composite-PK upsert matches (NULLs are distinct).
      optionType: p.optionType ?? "",
      strike: p.strike ?? 0,
      expiry: p.expiry ?? "1970-01-01",
      assetClass: p.assetClass,
      quantity: p.quantity,
      avgPrice: p.avgPrice ?? null,
      markPrice: p.markPrice ?? null,
      positionValue,
      weightPct: computePositionWeightPct(positionValue, navBaseFor(p.asOf)),
      delta: p.delta ?? null,
      gamma: p.gamma ?? null,
      theta: p.theta ?? null,
      vega: p.vega ?? null,
    };
  });

  // One synthetic CASH row per cash snapshot — keeps positions the single
  // source of truth for "what's in the account right now."
  for (const c of cashRows) {
    payload.push({
      accountId,
      asOfDate: c.date,
      symbol: "CASH",
      optionType: "",
      strike: 0,
      expiry: "1970-01-01",
      assetClass: "CASH",
      quantity: c.endingCash,
      avgPrice: null,
      markPrice: null,
      positionValue: c.endingCash,
      weightPct: computePositionWeightPct(c.endingCash, navBaseFor(c.date)),
      delta: null,
      gamma: null,
      theta: null,
      vega: null,
    });
  }

  if (payload.length === 0) return 0;
  await db()
    .insert(holdingsPositions)
    .values(payload)
    .onConflictDoUpdate({
      target: [
        holdingsPositions.accountId,
        holdingsPositions.asOfDate,
        holdingsPositions.symbol,
        holdingsPositions.optionType,
        holdingsPositions.strike,
        holdingsPositions.expiry,
      ],
      set: {
        assetClass: ex("asset_class"),
        quantity: ex("quantity"),
        avgPrice: ex("avg_price"),
        markPrice: ex("mark_price"),
        positionValue: ex("position_value"),
        weightPct: ex("weight_pct"),
        delta: ex("delta"),
        gamma: ex("gamma"),
        theta: ex("theta"),
        vega: ex("vega"),
      },
    });
  return payload.length;
}

/** Warm SPY into data_daily_prices for the NAV-vs-SPY overlay. Best-effort. */
async function refreshSpy(): Promise<number> {
  try {
    const rows = await marketdata.getDailyPrices("SPY", 800);
    return rows.length;
  } catch (err) {
    log.warn("holdings.sync.spy_failed", { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

// ─────────────────────────── orchestrator ───────────────────────────

/**
 * Pull the live Flex statement and ingest it. Throws IBKRFlexError (classified)
 * on a Flex-side failure; the endpoint maps that to a precise fail code.
 */
export async function syncHoldings(accountId: string): Promise<HoldingsSyncResult> {
  const cfg = await getHoldingsFlexConfig(accountId); // throws HoldingsNotConnectedError if unset
  const flex: FlexStatement = await fetchFlexStatement(cfg);

  // Prefer daily-resolution NAV from "NAV in Base" when present; otherwise the
  // ChangeInNAV aggregate (daily-incremental path).
  const navRows = flex.equity.length >= 2 ? equityToFlexNav(flex.equity) : flex.nav;

  const [navRowsUpserted, tradesInserted, positionsUpserted] = await Promise.all([
    upsertNavRows(accountId, navRows),
    upsertTrades(accountId, flex.trades),
    upsertPositions(accountId, flex.endingNavTotal, flex.positions, flex.cash),
  ]);
  const spyRows = await refreshSpy();

  return { accountId, navRowsUpserted, tradesInserted, positionsUpserted, spyRows };
}

/**
 * Sync every connected account (the daily cron). One account's failure (bad Flex
 * creds, IBKR hiccup) is logged + skipped, not fatal for the rest. SPY is warmed
 * once per account but it's an idempotent upsert, so that's fine.
 */
export async function syncAllHoldings(): Promise<{ synced: number; failed: number; accounts: { accountId: string; ok: boolean; error?: string }[] }> {
  const accounts = await db().select({ accountId: holdingsAccounts.accountId }).from(holdingsAccounts);
  const results: { accountId: string; ok: boolean; error?: string }[] = [];
  for (const { accountId } of accounts) {
    try {
      await syncHoldings(accountId);
      results.push({ accountId, ok: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn("holdings.sync.account.failed", { accountId, error });
      results.push({ accountId, ok: false, error });
    }
  }
  return { synced: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, accounts: results };
}
