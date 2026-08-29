/**
 * Replay game — shared types + the deterministic simulation engine.
 *
 * The game drops the player at a random past date with $100k and one ticker, then
 * walks forward one trading day at a time. Everything here is PURE: the server builds
 * a `GameDataset` (bars + a per-day event feed) once, the browser owns the mutable
 * `GameState` and calls these functions. No DB, no network, no LLM — which is why the
 * whole game needed no new tables.
 *
 * Two rules carry the design:
 *   1. **No look-ahead.** The player sees day D's CLOSE, so an order placed on D fills
 *      at D+1's OPEN. Filling at D's close would let them trade on a bar they already
 *      saw — the classic backtest cheat.
 *   2. **The end date is hidden and random.** Buy-and-hold-forever stops being a free
 *      win when the game can settle on any day, which is the whole point of #6: the
 *      player has to actually have a view, not just wait out the drawdown.
 */

// ───────────────────────────── the roster ─────────────────────────────

export interface GameTicker {
  symbol: string;
  name: string;
  /** One line on why this company is worth a game — shown on the start screen. */
  blurb: string;
}

/**
 * The playable universe, and the single source of truth for it (data validates the
 * query against this list; the SPA renders the start screen from it).
 *
 * Chosen so buy-and-hold is NOT the automatic answer. A megacap that only went up
 * teaches nothing — the player wins by doing nothing. Most of these round-tripped a
 * boom, so the same "just hold" instinct that wins on NVDA loses badly here, and the
 * window draw decides which lesson you get.
 */
export const GAME_UNIVERSE: readonly GameTicker[] = [
  { symbol: "NVDA", name: "NVIDIA", blurb: "The one everybody knows. Here as the control case: the run where holding was right." },
  { symbol: "ENPH", name: "Enphase Energy", blurb: "Solar microinverters. Went up 20x, then gave back nearly all of it — the hardest hold on this list." },
  { symbol: "SMCI", name: "Super Micro Computer", blurb: "AI server builder that became a meme, then an accounting controversy. Violent both ways." },
  { symbol: "CELH", name: "Celsius Holdings", blurb: "Energy drinks. Hypergrowth into every shelf in America, then the growth stopped." },
  { symbol: "DECK", name: "Deckers Outdoor", blurb: "UGG and HOKA. A quiet ten-bagger nobody talked about until it was over." },
  { symbol: "CPRT", name: "Copart", blurb: "Online salvage-car auctions. Boring, dominant, compounds for decades." },
  { symbol: "VRT", name: "Vertiv Holdings", blurb: "Power and cooling for data centers — the AI trade without the AI logo." },
  { symbol: "AXON", name: "Axon Enterprise", blurb: "Tasers and police body cameras. A near-monopoly on a market it invented." },
  { symbol: "FICO", name: "Fair Isaac", blurb: "The credit score itself. Pricing power most monopolies would envy." },
];

export const GAME_SYMBOLS: readonly string[] = GAME_UNIVERSE.map((t) => t.symbol);

// ───────────────────────────── dataset (server → client) ─────────────────────────────

/** One daily bar. Short keys — the dataset ships ~1300 of these per game. */
export interface GameBar {
  d: string; // YYYY-MM-DD
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * A headline in the "today" panel. `kind` drives the icon/color; `weight` is the
 * ranking score used to keep only the top few per day (a wall of 40 filings reads
 * like a database dump, not a game).
 */
export type GameEventKind = "earnings" | "filing" | "rating" | "move" | "macro" | "news";

export interface GameEvent {
  d: string; // the day it becomes visible to the player
  kind: GameEventKind;
  title: string;
  detail?: string;
  /** Higher = more market-moving. Ranking only; never shown. */
  weight: number;
  url?: string;
}

/** Index/vol tape for the day — the macro backdrop the player trades against. */
export interface GameMacro {
  spy: number | null; // % change
  qqq: number | null;
  vix: number | null; // level, not % change
}

/**
 * One reported quarter, stamped with when it became PUBLIC (the filing's acceptedDate),
 * not when the quarter ended. The whole point: on an in-game day the player may only see
 * fundamentals that had actually been filed by then. Showing today's P/E on a 2022 screen
 * would be a look-ahead leak dressed up as a stat.
 */
export interface GameFundamental {
  /** YYYY-MM-DD the filing hit the tape. Ascending across the array. */
  knownAt: string;
  /** Trailing-twelve-month diluted EPS as of this filing. */
  ttmEps: number | null;
  ttmRevenue: number | null;
  sharesOut: number | null;
  bookValuePerShare: number | null;
}

export interface GameDataset {
  symbol: string;
  companyName: string | null;
  bars: GameBar[];
  /** date → that day's events, already ranked and capped. */
  events: Record<string, GameEvent[]>;
  macro: Record<string, GameMacro>;
  /** Ascending by knownAt. Empty when the statements were unavailable. */
  fundamentals: GameFundamental[];
}

// ───────────────────────────── game state (client-owned) ─────────────────────────────

export const INITIAL_CASH = 100_000;

export type OrderSide = "buy" | "sell";

/** An order placed on the current day. Fills at the NEXT day's open (rule 1). */
export interface PendingOrder {
  side: OrderSide;
  shares: number;
}

export interface GameFill {
  d: string;
  side: OrderSide;
  shares: number;
  price: number;
}

export interface GameState {
  symbol: string;
  /** Index into `bars` of "today" — the last bar the player is allowed to see. */
  cursor: number;
  /** Index of the final bar. Hidden from the player until the game settles. */
  endIndex: number;
  cash: number;
  shares: number;
  /** Average cost of the open position. Zero when flat. */
  avgCost: number;
  /** Cumulative realized P&L from closed shares. */
  realized: number;
  fills: GameFill[];
  pending: PendingOrder | null;
  over: boolean;
}

/**
 * Start a game at `startIndex`, settling at `endIndex` (both bar indices; the caller
 * draws them — `pickWindow` does it randomly).
 */
export function newGame(symbol: string, startIndex: number, endIndex: number): GameState {
  return {
    symbol,
    cursor: startIndex,
    endIndex,
    cash: INITIAL_CASH,
    shares: 0,
    avgCost: 0,
    realized: 0,
    fills: [],
    pending: null,
    over: startIndex >= endIndex,
  };
}

/**
 * Draw a random [start, end] window from a bar series. `rand` is injected so tests
 * (and a seeded "share this game" link later) stay deterministic.
 *
 * The end is drawn from a range rather than fixed, so the player can't count on a
 * known horizon — see rule 2.
 *
 * `earliestIndex` floors the start. Callers use it to keep the game inside the era the
 * event feed actually covers: a window that opens before the news exists is playable
 * but reads as an empty game, since the player is trading blind on price alone.
 */
export function pickWindow(
  barCount: number,
  opts: { minDays?: number; maxDays?: number; earliestIndex?: number; rand?: () => number } = {},
): { startIndex: number; endIndex: number } {
  const minDays = opts.minDays ?? 250; // ~1 trading year
  const maxDays = opts.maxDays ?? 1000; // ~4 trading years
  const rand = opts.rand ?? Math.random;
  // Ignore a floor that leaves less than minDays of runway — better a short game inside
  // the covered era than a silent fall back to the very start of history.
  const floor = Math.max(0, Math.min(opts.earliestIndex ?? 0, Math.max(0, barCount - 1 - minDays)));

  const available = barCount - floor;
  // Too little history to honor minDays: use whatever there is.
  if (available <= minDays + 1) return { startIndex: floor, endIndex: Math.max(floor, barCount - 1) };

  const span = Math.min(maxDays, available - 1);
  const length = minDays + Math.floor(rand() * (span - minDays + 1));
  const startIndex = floor + Math.floor(rand() * (available - length));
  return { startIndex, endIndex: startIndex + length };
}

// ───────────────────────────── orders + the day clock ─────────────────────────────

/** Max shares buyable with current cash at `price` (no leverage, no fractional). */
export function maxBuyable(cash: number, price: number): number {
  if (!(price > 0)) return 0;
  return Math.floor(cash / price);
}

/**
 * Queue an order for the next open. Returns the state unchanged (plus a `reason`) when
 * the order can't stand — the UI surfaces the reason instead of silently dropping it.
 *
 * Only one order can be pending at a time: this is a one-decision-per-day game, and a
 * queue of stacked orders would need a whole order book to explain itself.
 */
export function placeOrder(
  state: GameState,
  order: PendingOrder,
  nextOpen: number | null,
): { state: GameState; reason: string | null } {
  if (state.over) return { state, reason: "Game is over" };
  if (!Number.isFinite(order.shares) || order.shares <= 0) return { state, reason: "Enter a share count" };
  const shares = Math.floor(order.shares);
  if (shares <= 0) return { state, reason: "Enter a share count" };

  if (order.side === "sell" && shares > state.shares) {
    return { state, reason: `You only hold ${state.shares} shares` };
  }
  // Buying power is checked against the next open — the price it will actually fill at.
  if (order.side === "buy" && nextOpen != null && shares * nextOpen > state.cash) {
    return { state, reason: `Not enough cash at the next open (~$${nextOpen.toFixed(2)})` };
  }
  return { state: { ...state, pending: { side: order.side, shares } }, reason: null };
}

export function cancelOrder(state: GameState): GameState {
  return state.pending ? { ...state, pending: null } : state;
}

/** Apply a fill to the book. Pure; no clamping — callers validate first. */
function fill(state: GameState, d: string, side: OrderSide, shares: number, price: number): GameState {
  const next = { ...state, fills: [...state.fills, { d, side, shares, price }] };
  if (side === "buy") {
    const cost = shares * price;
    next.avgCost = (state.avgCost * state.shares + cost) / (state.shares + shares);
    next.shares = state.shares + shares;
    next.cash = state.cash - cost;
  } else {
    next.realized = state.realized + shares * (price - state.avgCost);
    next.shares = state.shares - shares;
    next.cash = state.cash + shares * price;
    // Reset the cost basis when flat, so a re-entry doesn't inherit a stale average.
    if (next.shares === 0) next.avgCost = 0;
  }
  return next;
}

/**
 * Advance to the next trading day: move the cursor, then fill any pending order at
 * that day's OPEN (rule 1). Settles the game when the cursor reaches the hidden end.
 *
 * A buy that no longer fits (the open gapped up past the player's cash) is trimmed to
 * what's affordable rather than rejected — a rejected order on a gap day would feel
 * like the game ate the decision.
 */
export function nextDay(state: GameState, bars: GameBar[]): GameState {
  if (state.over) return state;
  const i = state.cursor + 1;
  if (i >= bars.length) return { ...state, over: true, pending: null };

  const bar = bars[i]!;
  let next: GameState = { ...state, cursor: i, pending: null };

  if (state.pending) {
    const { side } = state.pending;
    const price = bar.o;
    const want = state.pending.shares;
    const shares = side === "buy" ? Math.min(want, maxBuyable(state.cash, price)) : Math.min(want, state.shares);
    if (shares > 0 && price > 0) next = fill(next, bar.d, side, shares, price);
  }

  if (i >= state.endIndex) next.over = true;
  return next;
}

// ───────────────────────────── KPIs ─────────────────────────────

export interface GameKpis {
  /** Cash + position market value. */
  equity: number;
  cash: number;
  shares: number;
  avgCost: number;
  positionValue: number;
  unrealized: number;
  unrealizedPct: number | null;
  realized: number;
  /** Total return on the initial $100k. */
  totalReturnPct: number;
  /** Annualized (CAGR) — the game's actual scoreboard. Null before ~1 month elapsed,
   *  where annualizing a few days produces meaningless four-digit percentages. */
  cagrPct: number | null;
  /** Same window, all-in at the first available open and never touched. The control
   *  group: beating this is the only result that means anything. */
  buyHoldEquity: number;
  buyHoldReturnPct: number;
  buyHoldCagrPct: number | null;
  daysElapsed: number;
}

const MS_PER_DAY = 86_400_000;
/** Annualizing a short window yields a headline that is arithmetically correct and
 *  practically nonsense (a good 2 months reads as "+439% annualized"). Below this,
 *  report null and let the UI show a dash — the scoreboard has to stay honest. */
const MIN_DAYS_FOR_CAGR = 180;

function calendarDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / MS_PER_DAY));
}

/** Annualized return from a total multiple over `days`. Null when too short or wiped out. */
export function cagr(multiple: number, days: number): number | null {
  if (days < MIN_DAYS_FOR_CAGR || multiple <= 0) return null;
  return (multiple ** (365 / days) - 1) * 100;
}

export function computeKpis(state: GameState, bars: GameBar[], startIndex: number): GameKpis {
  const bar = bars[state.cursor] ?? bars[bars.length - 1]!;
  const price = bar.c;
  const positionValue = state.shares * price;
  const equity = state.cash + positionValue;
  const unrealized = state.shares > 0 ? state.shares * (price - state.avgCost) : 0;
  const days = calendarDays(bars[startIndex]?.d ?? bar.d, bar.d);

  // Benchmark buys at the first open the player could have traded at — the same
  // next-open rule they live under, so the comparison is honest.
  const bhOpen = bars[startIndex + 1]?.o ?? bars[startIndex]?.c ?? price;
  const bhShares = bhOpen > 0 ? Math.floor(INITIAL_CASH / bhOpen) : 0;
  const buyHoldEquity = bhShares * price + (INITIAL_CASH - bhShares * bhOpen);

  return {
    equity,
    cash: state.cash,
    shares: state.shares,
    avgCost: state.avgCost,
    positionValue,
    unrealized,
    unrealizedPct: state.shares > 0 && state.avgCost > 0 ? (price / state.avgCost - 1) * 100 : null,
    realized: state.realized,
    totalReturnPct: (equity / INITIAL_CASH - 1) * 100,
    cagrPct: cagr(equity / INITIAL_CASH, days),
    buyHoldEquity,
    buyHoldReturnPct: (buyHoldEquity / INITIAL_CASH - 1) * 100,
    buyHoldCagrPct: cagr(buyHoldEquity / INITIAL_CASH, days),
    daysElapsed: days,
  };
}

// ───────────────────────────── quote statistics ─────────────────────────────

/**
 * The "what am I looking at" panel: session numbers straight off the bar, range stats
 * over the visible past, and PIT valuation multiples.
 *
 * Every field here is computable from data the player is already allowed to see. There
 * is deliberately no forward P/E: consensus estimates carry no as-of date in our feed,
 * so a "2023 forward P/E" would really be an estimate analysts made in 2026 — the
 * future, printed on the dashboard.
 */
export interface GameQuote {
  close: number;
  open: number;
  high: number;
  low: number;
  prevClose: number | null;
  changeAbs: number | null;
  changePct: number | null;
  volume: number;
  /** Traded value ≈ volume × the session's average price. */
  turnover: number;
  /** (high − low) / prevClose, in percent. */
  rangePct: number | null;
  avgPrice: number;
  week52High: number | null;
  week52Low: number | null;
  marketCap: number | null;
  /** Null when TTM EPS is missing OR negative — the UI prints "Loss" for the latter. */
  peTtm: number | null;
  isLoss: boolean;
  priceToBook: number | null;
  psTtm: number | null;
  ttmEps: number | null;
}

/** Trading days in a 52-week window. */
const WEEK52_BARS = 252;

/**
 * The most recent fundamental the player is allowed to see on `date`. Linear scan from
 * the end: the array is one row per quarter (tens of entries), so an index would cost
 * more than it saves.
 */
export function pickFundamental(fundamentals: GameFundamental[], date: string): GameFundamental | null {
  for (let i = fundamentals.length - 1; i >= 0; i--) {
    const f = fundamentals[i]!;
    if (f.knownAt <= date) return f;
  }
  return null;
}

export function computeQuote(bars: GameBar[], cursor: number, fundamentals: GameFundamental[]): GameQuote | null {
  const bar = bars[cursor];
  if (!bar) return null;
  const prevClose = bars[cursor - 1]?.c ?? null;
  const avgPrice = (bar.h + bar.l + bar.c) / 3;

  let week52High: number | null = null;
  let week52Low: number | null = null;
  for (let i = Math.max(0, cursor - WEEK52_BARS + 1); i <= cursor; i++) {
    const b = bars[i]!;
    week52High = week52High == null ? b.h : Math.max(week52High, b.h);
    week52Low = week52Low == null ? b.l : Math.min(week52Low, b.l);
  }

  const f = pickFundamental(fundamentals, bar.d);
  const marketCap = f?.sharesOut != null ? bar.c * f.sharesOut : null;
  const eps = f?.ttmEps ?? null;
  const bvps = f?.bookValuePerShare ?? null;

  return {
    close: bar.c,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    prevClose,
    changeAbs: prevClose == null ? null : bar.c - prevClose,
    changePct: prevClose ? (bar.c / prevClose - 1) * 100 : null,
    volume: bar.v,
    turnover: bar.v * avgPrice,
    rangePct: prevClose ? ((bar.h - bar.l) / prevClose) * 100 : null,
    avgPrice,
    week52High,
    week52Low,
    marketCap,
    peTtm: eps != null && eps > 0 ? bar.c / eps : null,
    isLoss: eps != null && eps <= 0,
    priceToBook: bvps != null && bvps > 0 ? bar.c / bvps : null,
    psTtm: marketCap != null && f?.ttmRevenue != null && f.ttmRevenue > 0 ? marketCap / f.ttmRevenue : null,
    ttmEps: eps,
  };
}
