/**
 * Replay game — public, no login, no server state.
 *
 * Three phases: pick a company → trade it day by day → settle. The gateway hands over
 * one immutable dataset per company (bars + a ranked per-day event feed + the macro tape
 * + a PIT fundamentals timeline); every decision after that is local. The engine lives in
 * `@qt/shared/game` (pure, unit-tested); this file is the terminal shell around it.
 *
 * The chart is sliced to end at the cursor: handing the full series to a component that
 * renders it would leak the future in the most literal way possible.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { apiUrl, FETCH_OPTS } from "@/lib/api-base";
import { money, fmtPct, fmtNum } from "@/lib/format";
import { PriceChartLazy, type Bar, type ChartMarker } from "@/components/price-chart.lazy";
import { StartScreen } from "@/components/game/start-screen";
import { QuotePanel } from "@/components/game/quote-panel";
import { Settlement } from "@/components/game/settlement";
import { Watchlist, buildWatchRows } from "@/components/game/watchlist";
import { NewsFeed, buildNewsDays } from "@/components/game/news-feed";
import {
  newGame,
  pickWindow,
  placeOrder,
  cancelOrder,
  nextDay,
  computeKpis,
  computeQuote,
  maxBuyable,
  type GameDataset,
  type GameState,
  type GameTicker,
  type OrderSide,
} from "@qt/shared/game";

const UP = "#3fb950";
const DOWN = "#f85149";

const pnlColor = (v: number): string => (v > 0 ? UP : v < 0 ? DOWN : "var(--text)");

/** The event feed only has filings from ~2020 on (SEC submissions' "recent" shard) and
 *  headlines from the last year, so a window opening before that is price-only and reads
 *  as a dead game. Floor the draw at ~6 years back — which also lands on the "replay the
 *  last 5 years" framing the game is pitched as. */
const COVERED_YEARS = 6;

/** Bars fed to the chart BEFORE the game's first day. MA200 needs 200 sessions of history
 *  to have a value at all, so a shorter lead-in opens the game with the moving averages
 *  missing and then draws them in mid-run, which reads as a bug. */
const WARMUP_BARS = 260;

/** Index of the first bar inside the covered era (see COVERED_YEARS). */
function coveredFrom(bars: { d: string }[]): number {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - COVERED_YEARS);
  const iso = cutoff.toISOString().slice(0, 10);
  const i = bars.findIndex((b) => b.d >= iso);
  return i < 0 ? 0 : i;
}

export default function GamePage() {
  const [ticker, setTicker] = useState<GameTicker | null>(null);
  const [dataset, setDataset] = useState<GameDataset | null>(null);
  const [pending, setPending] = useState<string | null>(null); // symbol currently loading
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<string | null>(null);

  /** Draw a fresh window on an already-loaded dataset. */
  const deal = useCallback((d: GameDataset) => {
    const { startIndex: s, endIndex } = pickWindow(d.bars.length, { earliestIndex: coveredFrom(d.bars) });
    setStartIndex(s);
    setState(newGame(d.symbol, s, endIndex));
    setQty("");
    setReason(null);
  }, []);

  const start = useCallback(
    (t: GameTicker) => {
      setPending(t.symbol);
      setError(null);
      fetch(apiUrl(`/api/game/dataset?symbol=${t.symbol}`), FETCH_OPTS)
        .then(async (r) => {
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; data?: GameDataset; error?: { message?: string } | string };
          if (!r.ok || !j.ok || !j.data) {
            const e = j.error;
            throw new Error((typeof e === "object" ? e?.message : e) ?? `HTTP ${r.status}`);
          }
          return j.data;
        })
        .then((d) => {
          setTicker(t);
          setDataset(d);
          deal(d);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setPending(null));
    },
    [deal],
  );

  const bars = dataset?.bars ?? [];
  const today = state ? bars[state.cursor] : undefined;
  const nextOpen = state ? (bars[state.cursor + 1]?.o ?? null) : null;

  const kpis = useMemo(
    () => (state && bars.length ? computeKpis(state, bars, startIndex) : null),
    [state, bars, startIndex],
  );
  const quote = useMemo(
    () => (state && bars.length ? computeQuote(bars, state.cursor, dataset?.fundamentals ?? []) : null),
    [state, bars, dataset],
  );

  // Only the bars the player is allowed to have seen, plus a warm-up lead-in so the
  // moving averages are already valid on day one. `key` on the chart forces a remount per
  // symbol so lightweight-charts doesn't animate across two different stocks.
  const visibleBars: Bar[] = useMemo(
    () =>
      state
        ? bars.slice(Math.max(0, startIndex - WARMUP_BARS), state.cursor + 1).map((b) => ({
            time: b.d,
            open: b.o,
            high: b.h,
            low: b.l,
            close: b.c,
            volume: b.v,
          }))
        : [],
    [state, bars, startIndex],
  );

  const markers: ChartMarker[] = useMemo(
    () =>
      (state?.fills ?? []).map((f) => ({
        time: f.d,
        kind: f.side === "buy" ? ("insider_buy" as const) : ("insider_sell" as const),
        label: `${f.side === "buy" ? "B" : "S"} ${f.shares} @ ${f.price.toFixed(2)}`,
      })),
    [state],
  );

  const watchRows = useMemo(() => {
    if (!today || !state || !ticker) return [];
    const prev = bars[state.cursor - 1]?.c;
    return buildWatchRows(
      {
        symbol: ticker.symbol,
        name: ticker.name,
        close: today.c,
        pct: prev && prev > 0 ? (today.c / prev - 1) * 100 : null,
      },
      dataset?.tape ?? [],
      today.d,
    );
  }, [today, state, ticker, bars, dataset]);

  const newsDays = useMemo(
    () => (state && dataset ? buildNewsDays(bars, startIndex, state.cursor, dataset.events) : []),
    [state, dataset, bars, startIndex],
  );

  const submit = useCallback(
    (side: OrderSide) => {
      if (!state) return;
      const res = placeOrder(state, { side, shares: Number(qty) }, nextOpen);
      setState(res.state);
      setReason(res.reason);
      if (!res.reason) setQty("");
    },
    [state, qty, nextOpen],
  );

  // Functional update, not `nextDay(state, …)`: a held-down space bar fires many keydowns
  // inside one render cycle, and reading `state` from the closure would make them all
  // compute from the same day — the player would hold the key and watch days vanish.
  const advance = useCallback(() => {
    if (!bars.length) return;
    setState((s) => (s ? nextDay(s, bars) : s));
    setReason(null);
  }, [bars]);

  // Space bar = next day. The game is mostly this one key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      e.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  const backToMenu = useCallback(() => {
    setTicker(null);
    setDataset(null);
    setState(null);
    setError(null);
  }, []);

  if (!dataset || !state || !today || !kpis || !ticker) {
    return (
      <>
        <StartScreen onPick={start} loadingSymbol={pending} />
        {error && (
          <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "var(--panel)", border: `1px solid ${DOWN}`, color: DOWN, padding: "8px 14px", borderRadius: 4, fontSize: 13 }}>
            Failed to load: {error}
          </div>
        )}
      </>
    );
  }

  const affordable = nextOpen ? maxBuyable(state.cash, nextOpen) : 0;

  return (
    // The board is a fixed-height terminal, not a scrolling document: every rail is
    // bounded so its own overflow scrolls. Letting the page grow instead made the news
    // history stretch the grid row — and with it the chart container — to ~6000px.
    <div style={{ height: "100vh", boxSizing: "border-box", overflow: "hidden", background: "var(--bg)", color: "var(--text)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── Header: the in-game date. The tape lives in the watchlist rail. ── */}
      <header style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", flexShrink: 0 }}>
        <button
          onClick={backToMenu}
          style={{ fontSize: 18, fontWeight: 600, background: "none", border: "none", color: "var(--text)", cursor: "pointer", padding: 0 }}
        >
          Replay
        </button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)" }}>
          {today.d} · {dataset.companyName ?? ticker.name}
        </span>
        <button onClick={backToMenu} style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 12, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", borderRadius: 4 }}>
          Quit to menu
        </button>
      </header>

      {/* ── KPI strip: the account, not the stock ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 1, background: "var(--border)", border: "1px solid var(--border)", flexShrink: 0 }}>
        <Kpi label="Net liquidation" value={money(kpis.equity, "cell")} />
        <Kpi label="Cash" value={money(kpis.cash, "cell")} />
        <Kpi label="Position" value={kpis.shares ? `${fmtNum(kpis.shares, 0)} sh` : "—"} sub={kpis.shares ? `avg ${money(kpis.avgCost, "cell")}` : undefined} />
        <Kpi label="Unrealized" value={money(kpis.unrealized, "cell")} sub={fmtPct(kpis.unrealizedPct)} color={pnlColor(kpis.unrealized)} />
        <Kpi label="Realized" value={money(kpis.realized, "cell")} color={pnlColor(kpis.realized)} />
        <Kpi label="Total return" value={fmtPct(kpis.totalReturnPct)} color={pnlColor(kpis.totalReturnPct)} />
        <Kpi label="Annualized" value={fmtPct(kpis.cagrPct)} sub={`${kpis.daysElapsed}d elapsed`} color={pnlColor(kpis.cagrPct ?? 0)} />
        {/* The control group. Beating this is the only score that means anything. */}
        <Kpi label="Buy & hold" value={fmtPct(kpis.buyHoldReturnPct)} sub={`ann. ${fmtPct(kpis.buyHoldCagrPct)}`} color="var(--muted)" />
      </div>

      {/* Terminal layout: watchlist · chart · stats + order + news. */}
      <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr) 320px", gap: 12, flex: 1, minHeight: 0 }}>
        <Watchlist rows={watchRows} />

        {/* RSI/MACD stay ON: PriceChart allocates their panes regardless, so turning them
            off only buys dead space — and indicators belong in a trading game. */}
        <div style={{ border: "1px solid var(--border)", background: "var(--panel)", minHeight: 0, overflow: "hidden" }}>
          {visibleBars.length > 1 && (
            <PriceChartLazy
              key={ticker.symbol}
              bars={visibleBars}
              rangeDays={180}
              fairValue={null}
              costBasis={state.shares > 0 ? state.avgCost : null}
              markers={markers}
              showValuation={false}
            />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <div style={{ flexShrink: 0 }}>
            {quote && <QuotePanel quote={quote} symbol={ticker.symbol} name={dataset.companyName ?? ticker.name} />}
          </div>

          <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", marginBottom: 8 }}>Order</div>

            <input
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Shares"
              inputMode="numeric"
              disabled={state.over}
              style={{ width: "100%", padding: "6px 8px", fontFamily: "var(--font-mono)", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 4 }}
            />

            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              {([25, 50, 75, 100] as const).map((pct) => (
                <button
                  key={pct}
                  disabled={state.over || !affordable}
                  onClick={() => setQty(String(Math.floor((affordable * pct) / 100)))}
                  style={{ flex: 1, padding: "3px 0", fontSize: 11, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", borderRadius: 3 }}
                >
                  {pct}%
                </button>
              ))}
              <button
                disabled={state.over || !state.shares}
                onClick={() => setQty(String(state.shares))}
                style={{ flex: 1, padding: "3px 0", fontSize: 11, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", borderRadius: 3 }}
              >
                All
              </button>
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button disabled={state.over} onClick={() => submit("buy")} style={{ flex: 1, padding: "8px 0", fontWeight: 600, border: "none", background: UP, color: "#08130a", cursor: "pointer", borderRadius: 4 }}>
                Buy
              </button>
              <button disabled={state.over} onClick={() => submit("sell")} style={{ flex: 1, padding: "8px 0", fontWeight: 600, border: "none", background: DOWN, color: "#1a0708", cursor: "pointer", borderRadius: 4 }}>
                Sell
              </button>
            </div>

            {reason && <div style={{ marginTop: 8, fontSize: 12, color: DOWN }}>{reason}</div>}

            {/* Orders fill at the next open — say so, or a "pending" order looks broken. */}
            {state.pending ? (
              <div style={{ marginTop: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--warn)" }}>
                  {state.pending.side.toUpperCase()} {state.pending.shares} queued for the next open
                </span>
                <button
                  onClick={() => setState(cancelOrder(state))}
                  style={{ marginLeft: "auto", fontSize: 11, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", borderRadius: 3, padding: "2px 6px" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
                Orders fill at the next session's open. Buying power: {fmtNum(affordable, 0)} sh
              </div>
            )}

            <button
              onClick={advance}
              disabled={state.over}
              style={{
                width: "100%",
                marginTop: 10,
                padding: "10px 0",
                fontWeight: 600,
                border: "1px solid var(--accent)",
                background: state.over ? "var(--panel-2)" : "var(--accent)",
                color: state.over ? "var(--muted)" : "#04121f",
                cursor: state.over ? "default" : "pointer",
                borderRadius: 4,
              }}
            >
              {state.over ? "Game over" : "Next trading day  ␣"}
            </button>
          </div>

          <NewsFeed days={newsDays} />
        </div>
      </div>

      {state.over && (
        <Settlement
          kpis={kpis}
          state={state}
          symbol={ticker.symbol}
          settledOn={today.d}
          onPlayAgain={() => deal(dataset)}
          onNewCompany={backToMenu}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--panel)", padding: "8px 10px" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}
