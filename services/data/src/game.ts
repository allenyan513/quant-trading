/**
 * Replay-game dataset builder — assembles one self-contained JSON blob per game:
 * daily bars, a per-day event feed, and the macro tape.
 *
 * Why the event feed is synthesized rather than real headlines: FMP's news history is
 * capped at ~12 months on our plan (an earlier `from` 402s), and this game reaches back
 * 5 years. So the feed is composed from sources that ARE deep and free — SEC 8-K item
 * codes, analyst grade changes (back to 2012), earnings beats/misses, and the stock's
 * own ±5% days — with real headlines layered on only where they exist. Every item is a
 * real event on its real date; what's missing is a reporter's phrasing, not the fact.
 *
 * Each day is capped at MAX_EVENTS_PER_DAY by `weight`. A dump of every routine filing
 * reads like a database, not a game — the player gets the few things that mattered.
 */
import { fmpGet, marketdata, tickerToCik } from "@qt/shared";
import { fetch8KFilings, decodeItems, type DecodedItem } from "@qt/shared/edgar-8k";
import { GAME_SYMBOLS, type GameBar, type GameDataset, type GameEvent, type GameFundamental, type GameTapeRow } from "@qt/shared/game";
import { log } from "./log.js";

/** The watchlist rail's benchmark rows. A future portfolio mode extends this list. */
const TAPE = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq 100" },
  { symbol: "^VIX", name: "Volatility" },
] as const;

/** How many events survive per day. Five keeps the panel game-sized (user call). */
const MAX_EVENTS_PER_DAY = 5;

/** ~11y — the same depth `getDailyPrices` fetches, so a 5y game never runs short. */
const LOOKBACK_DAYS = 4000;

/** A single-day move at or beyond this is itself the story. */
const BIG_MOVE_PCT = 5;

// Weights are relative only — they rank the day's feed, and are never displayed.
const W = {
  earnings: 100,
  filingHigh: 90,
  bigMove: 80,
  filingMaterial: 60,
  ratingChange: 50,
  news: 40,
  filingRoutine: 10,
} as const;

// ───────────────────────────── bars ─────────────────────────────

interface PriceRow {
  tradeDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

/** Oldest-first bars, dropping any row without a full OHLC (the sim can't fill on it). */
async function loadBars(symbol: string): Promise<GameBar[]> {
  const rows = (await marketdata.getDailyPrices(symbol, LOOKBACK_DAYS)) as PriceRow[];
  const bars: GameBar[] = [];
  for (const r of rows) {
    if (r.open == null || r.high == null || r.low == null || r.close == null) continue;
    bars.push({ d: r.tradeDate, o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume ?? 0 });
  }
  bars.sort((a, b) => a.d.localeCompare(b.d));
  return bars;
}

// ───────────────────────────── event sources ─────────────────────────────

interface FmpGrade {
  date?: string;
  gradingCompany?: string;
  previousGrade?: string;
  newGrade?: string;
  action?: string;
}

/**
 * Analyst upgrades/downgrades. Deep (NVDA: ~1100 rows back to 2012) and free, which is
 * what makes a 5-year feed possible at all. `maintain` rows are dropped — a reiteration
 * is not news, and they'd swamp the genuine rating changes.
 */
async function gradeEvents(symbol: string): Promise<GameEvent[]> {
  const rows = (await fmpGet<FmpGrade[]>("grades", { symbol }, { softFail402: true })) ?? [];
  const out: GameEvent[] = [];
  for (const r of rows) {
    const d = (r.date ?? "").slice(0, 10);
    const action = (r.action ?? "").toLowerCase();
    if (!d || action === "maintain") continue;
    const firm = r.gradingCompany ?? "An analyst";
    const verb = action === "upgrade" ? "upgrades" : action === "downgrade" ? "downgrades" : "initiates";
    const to = r.newGrade ?? "";
    const from = r.previousGrade ?? "";
    out.push({
      d,
      kind: "rating",
      title: `${firm} ${verb} ${symbol}${to ? ` to ${to}` : ""}`,
      detail: from && to && from !== to ? `${from} → ${to}` : undefined,
      weight: W.ratingChange + (action === "downgrade" ? 5 : 0), // downgrades sting more
    });
  }
  return out;
}

interface FmpEarnings {
  date?: string;
  epsActual?: number | null;
  epsEstimated?: number | null;
  revenueActual?: number | null;
  revenueEstimated?: number | null;
}

/** Earnings with the beat/miss framing — usually the biggest single-day event there is. */
async function earningsEvents(symbol: string): Promise<GameEvent[]> {
  const rows = (await fmpGet<FmpEarnings[]>("earnings", { symbol, limit: 60 }, { softFail402: true })) ?? [];
  const out: GameEvent[] = [];
  for (const r of rows) {
    const d = (r.date ?? "").slice(0, 10);
    if (!d || r.epsActual == null) continue; // future/unreported rows carry no information
    const est = r.epsEstimated;
    let verdict = "reports earnings";
    if (est != null && est !== 0) {
      const surprisePct = ((r.epsActual - est) / Math.abs(est)) * 100;
      verdict = surprisePct >= 0 ? `beats EPS by ${surprisePct.toFixed(0)}%` : `misses EPS by ${Math.abs(surprisePct).toFixed(0)}%`;
    }
    const rev =
      r.revenueActual != null ? ` · revenue $${(r.revenueActual / 1e9).toFixed(2)}B` : "";
    out.push({
      d,
      kind: "earnings",
      title: `${symbol} ${verdict}`,
      detail: `EPS ${r.epsActual}${est != null ? ` vs ${est} est` : ""}${rev}`,
      weight: W.earnings,
    });
  }
  return out;
}

/** SEC 8-K material events. Free and deep; item codes already decode to plain English. */
async function filingEvents(symbol: string): Promise<GameEvent[]> {
  const cik = await tickerToCik(symbol);
  if (!cik) return [];
  const filings = await fetch8KFilings(cik);
  if (!filings) return [];

  const out: GameEvent[] = [];
  for (const f of filings) {
    const items = decodeItems(f.items);
    const top = items[0];
    if (!top) continue;
    // 9.01 (exhibits) rides along with almost every 8-K and says nothing on its own.
    if (items.length === 1 && top.code === "9.01") continue;
    const weight = top.category === "high" ? W.filingHigh : top.category === "material" ? W.filingMaterial : W.filingRoutine;
    out.push({
      d: f.filedDate,
      kind: "filing",
      title: `8-K: ${top.label}`,
      detail: items.length > 1 ? items.map((i: DecodedItem) => i.code).join(", ") : undefined,
      weight,
    });
  }
  return out;
}

interface FmpNews {
  symbol?: string;
  publishedDate?: string;
  title?: string;
  text?: string;
  url?: string;
  site?: string;
}

/**
 * Real headlines for the trailing window the plan allows (~12 months). Best-effort:
 * a 402 or an outage yields an empty list and the deterministic feed carries the game.
 */
async function newsEvents(symbol: string, from: string, to: string): Promise<GameEvent[]> {
  const rows = await fmpGet<FmpNews[]>(
    "news/stock",
    { symbols: symbol, from, to, limit: 250 },
    { softFail402: true },
  ).catch(() => null);
  if (!rows?.length) return [];
  return rows.flatMap((r) => {
    const d = (r.publishedDate ?? "").slice(0, 10);
    if (!d || !r.title) return [];
    return [{ d, kind: "news" as const, title: r.title, detail: r.site ?? undefined, weight: W.news, url: r.url }];
  });
}

/** The stock's own outsized days — the move IS the headline, even with no filing behind it. */
function moveEvents(symbol: string, bars: GameBar[]): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!.c;
    const bar = bars[i]!;
    if (!(prev > 0)) continue;
    const pct = (bar.c / prev - 1) * 100;
    if (Math.abs(pct) < BIG_MOVE_PCT) continue;
    out.push({
      d: bar.d,
      kind: "move",
      title: `${symbol} ${pct >= 0 ? "jumps" : "drops"} ${Math.abs(pct).toFixed(1)}%`,
      detail: `Closed at $${bar.c.toFixed(2)}`,
      // A 12% day outranks a 5% day; capped so it can't outrank earnings on noise alone.
      weight: W.bigMove + Math.min(15, Math.abs(pct)),
    });
  }
  return out;
}

// ───────────────────────────── PIT fundamentals ─────────────────────────────

interface FmpQuarter {
  date?: string;
  /** When the filing hit EDGAR — the PIT anchor. Falls back to fiscal date if absent. */
  acceptedDate?: string;
  epsDiluted?: number | null;
  revenue?: number | null;
  weightedAverageShsOutDil?: number | null;
  totalStockholdersEquity?: number | null;
}

/** 10 years of quarters — deeper than any window the game can draw. */
const QUARTERS = 40;

/** Four consecutive quarters ending at `i` (newest-first array), or null if short. */
function ttm(rows: FmpQuarter[], i: number, key: "epsDiluted" | "revenue"): number | null {
  let sum = 0;
  for (let k = i; k < i + 4; k++) {
    const v = rows[k]?.[key];
    if (v == null) return null;
    sum += v;
  }
  return sum;
}

/**
 * Build the PIT fundamentals timeline: one row per reported quarter, stamped with the
 * date it became public rather than the date the quarter ended. A quarter ending in
 * January that files in late February must not be visible on February 1st.
 *
 * Statements are fetched straight from FMP rather than through the marketdata cache: that
 * layer serves EDGAR-derived rows whose field names vary by source, and the game only
 * needs four numbers with a reliable acceptedDate.
 */
async function loadFundamentals(symbol: string): Promise<GameFundamental[]> {
  const [income, balance] = await Promise.all([
    fmpGet<FmpQuarter[]>("income-statement", { symbol, period: "quarter", limit: QUARTERS }, { softFail402: true }),
    fmpGet<FmpQuarter[]>("balance-sheet-statement", { symbol, period: "quarter", limit: QUARTERS }, { softFail402: true }),
  ]);
  if (!income?.length) return [];

  // Equity by fiscal date, so a balance sheet joins its income statement.
  const equityByDate = new Map<string, number>();
  for (const b of balance ?? []) {
    if (b.date && b.totalStockholdersEquity != null) equityByDate.set(b.date, b.totalStockholdersEquity);
  }

  const out: GameFundamental[] = [];
  for (let i = 0; i < income.length; i++) {
    const r = income[i]!;
    // acceptedDate is "YYYY-MM-DD HH:MM:SS"; the date half is all the game needs.
    const knownAt = (r.acceptedDate ?? r.date ?? "").slice(0, 10);
    if (!knownAt) continue;
    const shares = r.weightedAverageShsOutDil ?? null;
    const equity = r.date ? (equityByDate.get(r.date) ?? null) : null;
    out.push({
      knownAt,
      ttmEps: ttm(income, i, "epsDiluted"),
      ttmRevenue: ttm(income, i, "revenue"),
      sharesOut: shares,
      bookValuePerShare: equity != null && shares ? equity / shares : null,
    });
  }
  // Ascending — pickFundamental scans from the end for the newest already-public row.
  return out.sort((a, b) => a.knownAt.localeCompare(b.knownAt));
}

// ───────────────────────────── watchlist tape ─────────────────────────────

/**
 * Close + day change per session for each benchmark. Values are rounded on the way out:
 * the raw doubles carry 15 significant digits that JSON faithfully serializes, which
 * triples this section's payload for precision no one can see on a watchlist row.
 */
async function loadTape(): Promise<GameTapeRow[]> {
  const rows = await Promise.all(
    TAPE.map(async ({ symbol, name }) => {
      const bars = await loadBars(symbol).catch((err) => {
        log.warn("game.tape.failed", { symbol, error: err instanceof Error ? err.message : String(err) });
        return [] as GameBar[];
      });
      const days: Record<string, { c: number; pct: number | null }> = {};
      for (let i = 0; i < bars.length; i++) {
        const prev = bars[i - 1]?.c;
        const c = bars[i]!.c;
        days[bars[i]!.d] = {
          c: Math.round(c * 100) / 100,
          pct: prev && prev > 0 ? Math.round((c / prev - 1) * 10_000) / 100 : null,
        };
      }
      return { symbol, name, days };
    }),
  );
  return rows.filter((r) => Object.keys(r.days).length > 0);
}

// ───────────────────────────── assembly ─────────────────────────────

/** Group by day, rank by weight, keep the top N. */
function bucketByDay(events: GameEvent[]): Record<string, GameEvent[]> {
  const byDay = new Map<string, GameEvent[]>();
  for (const e of events) {
    const list = byDay.get(e.d);
    if (list) list.push(e);
    else byDay.set(e.d, [e]);
  }
  const out: Record<string, GameEvent[]> = {};
  for (const [d, list] of byDay) {
    out[d] = list.sort((a, b) => b.weight - a.weight).slice(0, MAX_EVENTS_PER_DAY);
  }
  return out;
}

/**
 * In-process cache. A cold build fans out to FMP (grades/earnings/news), SEC, and three
 * macro series — several seconds. The underlying history is immutable except for the
 * newest bar, so serving a few-hours-old dataset costs the player nothing and makes
 * "start a game" feel instant. Lost on restart, which is fine: it rebuilds.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; dataset: GameDataset }>();

/**
 * Build one game's dataset. Every source is best-effort and independent: a dead SEC or a
 * plan-gated news call degrades the feed but never fails the game — the bars are the only
 * hard requirement.
 */
export async function buildGameDataset(symbol: string): Promise<GameDataset> {
  const sym = symbol.toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.dataset;

  const bars = await loadBars(sym);
  if (!bars.length) throw new Error(`no price history for ${sym}`);

  // Real headlines only reach ~12 months back on our plan; ask for exactly that.
  const newsFrom = new Date(Date.now() - 300 * 86_400_000).toISOString().slice(0, 10);
  const newsTo = bars[bars.length - 1]!.d;

  const settle = async (label: string, p: Promise<GameEvent[]>): Promise<GameEvent[]> =>
    p.catch((err) => {
      log.warn("game.source.failed", { symbol: sym, source: label, error: err instanceof Error ? err.message : String(err) });
      return [];
    });

  const [grades, earnings, filings, news, tape, profile, fundamentals] = await Promise.all([
    settle("grades", gradeEvents(sym)),
    settle("earnings", earningsEvents(sym)),
    settle("filings", filingEvents(sym)),
    settle("news", newsEvents(sym, newsFrom, newsTo)),
    loadTape().catch(() => [] as GameTapeRow[]),
    marketdata.getProfile(sym).catch(() => null),
    loadFundamentals(sym).catch((err) => {
      log.warn("game.source.failed", { symbol: sym, source: "fundamentals", error: err instanceof Error ? err.message : String(err) });
      return [] as GameFundamental[];
    }),
  ]);

  const events = bucketByDay([...grades, ...earnings, ...filings, ...news, ...moveEvents(sym, bars)]);
  log.info("game.dataset.built", {
    symbol: sym,
    bars: bars.length,
    days: Object.keys(events).length,
    grades: grades.length,
    earnings: earnings.length,
    filings: filings.length,
    news: news.length,
    fundamentals: fundamentals.length,
  });

  const dataset: GameDataset = {
    symbol: sym,
    companyName: typeof profile?.companyName === "string" ? profile.companyName : null,
    bars,
    events,
    tape,
    fundamentals,
  };
  cache.set(sym, { at: Date.now(), dataset });
  return dataset;
}
