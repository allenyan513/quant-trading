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
import type { GameBar, GameDataset, GameEvent, GameMacro } from "@qt/shared/game";
import { log } from "./log.js";

/** Presets: distinct enough regimes that the same strategy scores very differently. */
export const GAME_SYMBOLS = ["NVDA", "TSLA", "AAPL", "META", "PLTR"] as const;

/** Index/vol tickers behind the macro strip. */
const MACRO = { spy: "SPY", qqq: "QQQ", vix: "^VIX" } as const;

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

// ───────────────────────────── macro tape ─────────────────────────────

/** SPY/QQQ % change + the VIX level per day. Missing series degrade to nulls. */
async function loadMacro(): Promise<Record<string, GameMacro>> {
  const [spy, qqq, vix] = await Promise.all(
    [MACRO.spy, MACRO.qqq, MACRO.vix].map((s) =>
      loadBars(s).catch((err) => {
        log.warn("game.macro.failed", { symbol: s, error: err instanceof Error ? err.message : String(err) });
        return [] as GameBar[];
      }),
    ),
  );

  const pctByDate = (bars: GameBar[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (let i = 1; i < bars.length; i++) {
      const prev = bars[i - 1]!.c;
      if (prev > 0) m.set(bars[i]!.d, (bars[i]!.c / prev - 1) * 100);
    }
    return m;
  };
  const spyPct = pctByDate(spy!);
  const qqqPct = pctByDate(qqq!);
  const vixLevel = new Map(vix!.map((b) => [b.d, b.c]));

  const out: Record<string, GameMacro> = {};
  for (const d of new Set([...spyPct.keys(), ...qqqPct.keys(), ...vixLevel.keys()])) {
    out[d] = { spy: spyPct.get(d) ?? null, qqq: qqqPct.get(d) ?? null, vix: vixLevel.get(d) ?? null };
  }
  return out;
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

  const [grades, earnings, filings, news, macro, profile] = await Promise.all([
    settle("grades", gradeEvents(sym)),
    settle("earnings", earningsEvents(sym)),
    settle("filings", filingEvents(sym)),
    settle("news", newsEvents(sym, newsFrom, newsTo)),
    loadMacro().catch(() => ({}) as Record<string, GameMacro>),
    marketdata.getProfile(sym).catch(() => null),
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
  });

  const dataset: GameDataset = {
    symbol: sym,
    companyName: typeof profile?.companyName === "string" ? profile.companyName : null,
    bars,
    events,
    macro,
  };
  cache.set(sym, { at: Date.now(), dataset });
  return dataset;
}
