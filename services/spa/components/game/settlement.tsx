/**
 * Settlement screen — the scoreboard, shown as a modal over the frozen board so the
 * player can still see the chart that produced the result.
 *
 * The headline is the comparison, not the raw return: +40% means nothing until you know
 * buy & hold made +90% over the same days. That verdict is the whole point of the game,
 * so it gets the largest type on the screen.
 */
import { money, fmtPct } from "@/lib/format";
import type { GameKpis, GameState } from "@qt/shared/game";
import { INITIAL_CASH } from "@qt/shared/game";

const UP = "#3fb950";
const DOWN = "#f85149";

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", color: color ?? "var(--text)" }}>{value}</span>
    </div>
  );
}

export function Settlement({
  kpis,
  state,
  symbol,
  settledOn,
  onPlayAgain,
  onNewCompany,
}: {
  kpis: GameKpis;
  state: GameState;
  symbol: string;
  settledOn: string;
  onPlayAgain: () => void;
  onNewCompany: () => void;
}) {
  const edge = kpis.equity - kpis.buyHoldEquity;
  const tied = Math.abs(edge) < 0.01;
  const beat = edge > 0;
  const verdict = tied ? "You matched buy & hold" : beat ? "You beat buy & hold" : "Buy & hold beat you";
  const verdictColor = tied ? "var(--text)" : beat ? UP : DOWN;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4, 7, 12, 0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
    >
      <div style={{ width: "100%", maxWidth: 460, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: 24 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--muted)" }}>
          {symbol} · settled {settledOn}
        </div>

        <div style={{ fontSize: 26, fontWeight: 600, color: verdictColor, margin: "8px 0 2px" }}>{verdict}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18 }}>
          {tied ? "Dead even — you were the benchmark." : `${money(Math.abs(edge), "headline")} ${beat ? "ahead of" : "behind"} doing nothing.`}
        </div>

        <Line label="Final value" value={money(kpis.equity, "headline")} />
        <Line label="Started with" value={money(INITIAL_CASH, "headline")} />
        <Line label="Total return" value={fmtPct(kpis.totalReturnPct)} color={kpis.totalReturnPct >= 0 ? UP : DOWN} />
        <Line label="Annualized" value={fmtPct(kpis.cagrPct)} color={(kpis.cagrPct ?? 0) >= 0 ? UP : DOWN} />
        <Line label="Held for" value={`${kpis.daysElapsed} days`} />
        <Line label="Trades" value={String(state.fills.length)} />
        <Line label="Buy & hold return" value={fmtPct(kpis.buyHoldReturnPct)} color="var(--muted)" />
        <Line label="Buy & hold annualized" value={fmtPct(kpis.buyHoldCagrPct)} color="var(--muted)" />

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            onClick={onPlayAgain}
            style={{ flex: 1, padding: "10px 0", fontWeight: 600, border: "1px solid var(--accent)", background: "var(--accent)", color: "#04121f", cursor: "pointer", borderRadius: 4 }}
          >
            Run it again
          </button>
          <button
            onClick={onNewCompany}
            style={{ flex: 1, padding: "10px 0", fontWeight: 600, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer", borderRadius: 4 }}
          >
            Pick another company
          </button>
        </div>
        {/* "Run it again" redraws the window on the SAME ticker — a different slice of the
            same story, which is the fastest way to feel how much the draw matters. */}
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
          A new run draws a different window on {symbol}.
        </div>
      </div>
    </div>
  );
}
