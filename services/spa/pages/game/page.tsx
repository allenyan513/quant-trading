/**
 * Replay game — public, no login, no server state.
 *
 * The whole simulation runs in this component: the gateway hands over one immutable
 * dataset (bars + a ranked per-day event feed + the macro tape), and every decision
 * after that is local. The engine lives in `@qt/shared/game` (pure, unit-tested); this
 * file is the IBKR-ish shell around it — KPI strip, chart, order ticket, news panel.
 *
 * The chart is deliberately sliced to `bars[0..cursor]`: handing the full series to a
 * component that renders it would leak the future in the most literal way possible.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { apiUrl, FETCH_OPTS } from "@/lib/api-base";
import { money, fmtPct, fmtNum } from "@/lib/format";
import { PriceChartLazy, type Bar, type ChartMarker } from "@/components/price-chart.lazy";
import {
  newGame,
  pickWindow,
  placeOrder,
  cancelOrder,
  nextDay,
  computeKpis,
  maxBuyable,
  INITIAL_CASH,
  type GameDataset,
  type GameState,
  type GameEvent,
  type OrderSide,
} from "@qt/shared/game";

const SYMBOLS = ["NVDA", "TSLA", "AAPL", "META", "PLTR"] as const;

const UP = "#3fb950";
const DOWN = "#f85149";

/** Icon + tint per event kind — the news panel's only visual coding. */
const EVENT_STYLE: Record<GameEvent["kind"], { icon: string; color: string }> = {
  earnings: { icon: "◆", color: "#58a6ff" },
  filing: { icon: "▣", color: "#d29922" },
  rating: { icon: "★", color: "#a371f7" },
  move: { icon: "⚡", color: "#f0883e" },
  macro: { icon: "◇", color: "var(--muted)" },
  news: { icon: "●", color: "var(--muted)" },
};

const pnlColor = (v: number): string => (v > 0 ? UP : v < 0 ? DOWN : "var(--text)");

/** The event feed only has filings from ~2020 on (SEC submissions' "recent" shard) and
 *  headlines from the last year, so a window opening before that is price-only and reads
 *  as a dead game. Floor the draw at ~6 years back — which also lands on the "replay the
 *  last 5 years" framing the game is pitched as. */
const COVERED_YEARS = 6;

/** Index of the first bar inside the covered era (see COVERED_YEARS). */
function coveredFrom(d: GameDataset): number {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - COVERED_YEARS);
  const iso = cutoff.toISOString().slice(0, 10);
  const i = d.bars.findIndex((b) => b.d >= iso);
  return i < 0 ? 0 : i;
}

export default function GamePage() {
  const [symbol, setSymbol] = useState<(typeof SYMBOLS)[number]>("NVDA");
  const [dataset, setDataset] = useState<GameDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<string | null>(null);

  // Fetch the dataset, then draw a random window and start. Re-runs on symbol change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDataset(null);
    setState(null);

    fetch(apiUrl(`/api/game/dataset?symbol=${symbol}`), FETCH_OPTS)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; data?: GameDataset; error?: { message?: string } | string };
        if (!r.ok || !j.ok || !j.data) {
          const e = j.error;
          throw new Error((typeof e === "object" ? e?.message : e) ?? `HTTP ${r.status}`);
        }
        return j.data;
      })
      .then((d) => {
        if (cancelled) return;
        const { startIndex: s, endIndex } = pickWindow(d.bars.length, { earliestIndex: coveredFrom(d) });
        setDataset(d);
        setStartIndex(s);
        setState(newGame(d.symbol, s, endIndex));
        setQty("");
        setReason(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const bars = dataset?.bars ?? [];
  const today = state ? bars[state.cursor] : undefined;
  const nextOpen = state ? (bars[state.cursor + 1]?.o ?? null) : null;
  const kpis = useMemo(
    () => (state && bars.length ? computeKpis(state, bars, startIndex) : null),
    [state, bars, startIndex],
  );

  // Only the bars the player is allowed to have seen. `key` on the chart forces a
  // remount per symbol so lightweight-charts doesn't animate across two different stocks.
  const visibleBars: Bar[] = useMemo(
    () =>
      state
        ? bars.slice(Math.max(0, startIndex - 120), state.cursor + 1).map((b) => ({
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

  const todaysEvents = today ? (dataset?.events[today.d] ?? []) : [];
  const todaysMacro = today ? dataset?.macro[today.d] : undefined;

  const submit = useCallback(
    (side: OrderSide) => {
      if (!state) return;
      const shares = Number(qty);
      const res = placeOrder(state, { side, shares }, nextOpen);
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

  const restart = useCallback(() => {
    if (!dataset) return;
    const { startIndex: s, endIndex } = pickWindow(dataset.bars.length, { earliestIndex: coveredFrom(dataset) });
    setStartIndex(s);
    setState(newGame(dataset.symbol, s, endIndex));
    setQty("");
    setReason(null);
  }, [dataset]);

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

  const affordable = today && nextOpen ? maxBuyable(state?.cash ?? 0, nextOpen) : 0;
  const vsBenchmark = kpis ? kpis.equity - kpis.buyHoldEquity : 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── Header: symbol picker + the in-game date ── */}
      <header style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Replay</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                border: `1px solid ${s === symbol ? "var(--accent)" : "var(--border)"}`,
                background: s === symbol ? "var(--panel-2)" : "transparent",
                color: s === symbol ? "var(--accent)" : "var(--muted)",
                cursor: "pointer",
                borderRadius: 4,
              }}
            >
              {s}
            </button>
          ))}
        </div>
        {today && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)" }}>
            {today.d} · {dataset?.companyName ?? symbol} ${today.c.toFixed(2)}
          </span>
        )}
        {todaysMacro && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
            SPY <span style={{ color: pnlColor(todaysMacro.spy ?? 0) }}>{fmtPct(todaysMacro.spy)}</span> · QQQ{" "}
            <span style={{ color: pnlColor(todaysMacro.qqq ?? 0) }}>{fmtPct(todaysMacro.qqq)}</span> · VIX{" "}
            {todaysMacro.vix?.toFixed(1) ?? "—"}
          </span>
        )}
        <button onClick={restart} style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 12, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", borderRadius: 4 }}>
          New game
        </button>
      </header>

      {loading && <p style={{ color: "var(--muted)" }}>Loading {symbol} history…</p>}
      {error && <p style={{ color: DOWN }}>Failed to load: {error}</p>}

      {state && kpis && today && (
        <>
          {/* ── KPI strip ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 1, background: "var(--border)", border: "1px solid var(--border)" }}>
            <Kpi label="Net liquidation" value={money(kpis.equity, "cell")} />
            <Kpi label="Cash" value={money(kpis.cash, "cell")} />
            <Kpi
              label="Position"
              value={kpis.shares ? `${kpis.shares} sh` : "—"}
              sub={kpis.shares ? `avg ${money(kpis.avgCost, "cell")}` : undefined}
            />
            <Kpi label="Unrealized" value={money(kpis.unrealized, "cell")} sub={fmtPct(kpis.unrealizedPct)} color={pnlColor(kpis.unrealized)} />
            <Kpi label="Realized" value={money(kpis.realized, "cell")} color={pnlColor(kpis.realized)} />
            <Kpi label="Total return" value={fmtPct(kpis.totalReturnPct)} color={pnlColor(kpis.totalReturnPct)} />
            <Kpi label="Annualized" value={fmtPct(kpis.cagrPct)} sub={`${kpis.daysElapsed}d elapsed`} color={pnlColor(kpis.cagrPct ?? 0)} />
            {/* The control group. Beating this is the only score that means anything. */}
            <Kpi
              label="Buy & hold"
              value={fmtPct(kpis.buyHoldReturnPct)}
              sub={`ann. ${fmtPct(kpis.buyHoldCagrPct)}`}
              color="var(--muted)"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 12, flex: 1, minHeight: 560 }}>
            {/* ── Chart ── */}
            {/* RSI/MACD stay ON: PriceChart allocates their panes regardless, so turning
                them off only buys dead space — and indicators belong in a trading game. */}
            <div style={{ border: "1px solid var(--border)", background: "var(--panel)", minHeight: 560 }}>
              {visibleBars.length > 1 && (
                <PriceChartLazy
                  key={symbol}
                  bars={visibleBars}
                  rangeDays={180}
                  fairValue={null}
                  costBasis={state.shares > 0 ? state.avgCost : null}
                  markers={markers}
                  showValuation={false}
                />
              )}
            </div>

            {/* ── Right rail: order ticket + today's news ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
              <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: 12 }}>
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
                  <button
                    disabled={state.over}
                    onClick={() => submit("buy")}
                    style={{ flex: 1, padding: "8px 0", fontWeight: 600, border: "none", background: UP, color: "#08130a", cursor: "pointer", borderRadius: 4 }}
                  >
                    Buy
                  </button>
                  <button
                    disabled={state.over}
                    onClick={() => submit("sell")}
                    style={{ flex: 1, padding: "8px 0", fontWeight: 600, border: "none", background: DOWN, color: "#1a0708", cursor: "pointer", borderRadius: 4 }}
                  >
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

              {/* ── Today's news: the top few events, never a full dump ── */}
              <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: 12, flex: 1, minHeight: 0, overflowY: "auto" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", marginBottom: 8 }}>
                  {today.d} · News
                </div>
                {todaysEvents.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Quiet session. No material events.</div>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {todaysEvents.map((e, i) => {
                      const st = EVENT_STYLE[e.kind];
                      return (
                        <li key={`${e.kind}-${i}`} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.4 }}>
                          <span style={{ color: st.color }}>{st.icon}</span>
                          <span>
                            <span>{e.title}</span>
                            {e.detail && <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>{e.detail}</div>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* ── Settlement ── */}
          {state.over && (
            <div style={{ border: `1px solid var(--accent)`, background: "var(--panel-2)", padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                Settled on {today.d} — {money(kpis.equity, "headline")} from {money(INITIAL_CASH, "headline")}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {fmtPct(kpis.totalReturnPct)} over {kpis.daysElapsed} days ({fmtPct(kpis.cagrPct)} annualized) across{" "}
                {state.fills.length} {state.fills.length === 1 ? "trade" : "trades"}. Buy &amp; hold over the same window:{" "}
                {fmtPct(kpis.buyHoldReturnPct)} ({fmtPct(kpis.buyHoldCagrPct)} annualized) —{" "}
                <strong style={{ color: vsBenchmark > 0 ? UP : vsBenchmark < 0 ? DOWN : "var(--text)" }}>
                  {/* An all-in-day-one player IS the benchmark; "beat it by $0.00" reads like a bug. */}
                  {Math.abs(vsBenchmark) < 0.01
                    ? "you matched it"
                    : `you ${vsBenchmark > 0 ? "beat" : "trailed"} it by ${money(Math.abs(vsBenchmark), "cell")}`}
                </strong>
                .
              </div>
            </div>
          )}
        </>
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
