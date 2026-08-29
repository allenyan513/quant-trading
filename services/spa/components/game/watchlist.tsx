/**
 * Watchlist rail — the played symbol plus the market context (SPY / QQQ / VIX) for the
 * in-game session, so the player can tell "my stock fell 4%" apart from "everything
 * fell 4%". Those are completely different trades and the old header strip buried the
 * distinction in one line of small text.
 *
 * Only the played symbol is tradable today; the rest are read-only benchmarks. The list
 * is rendered from `GameTapeRow[]` rather than fixed spy/qqq fields so a future portfolio
 * mode can drop 5–15 real positions into the same rail unchanged.
 */
import { fmtPct } from "@/lib/format";
import type { GameTapeRow } from "@qt/shared/game";

const UP = "#3fb950";
const DOWN = "#f85149";

export interface WatchRow {
  symbol: string;
  name: string;
  close: number | null;
  pct: number | null;
  /** The one the player is actually trading. */
  active?: boolean;
}

/** Build the rail's rows for `date`: the played symbol first, then the benchmarks. */
export function buildWatchRows(
  played: { symbol: string; name: string; close: number; pct: number | null },
  tape: GameTapeRow[],
  date: string,
): WatchRow[] {
  return [
    { ...played, active: true },
    ...tape.map((t) => {
      const day = t.days[date];
      return { symbol: t.symbol, name: t.name, close: day?.c ?? null, pct: day?.pct ?? null };
    }),
  ];
}

export function Watchlist({ rows }: { rows: WatchRow[] }) {
  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", padding: "10px 12px 6px", flexShrink: 0 }}>
        Watchlist
      </div>
      {rows.map((r) => {
        const color = r.pct == null ? "var(--text)" : r.pct > 0 ? UP : r.pct < 0 ? DOWN : "var(--text)";
        return (
          <div
            key={r.symbol}
            style={{
              padding: "7px 12px",
              borderTop: "1px solid var(--border)",
              // A left accent marks the tradable row without adding a legend.
              borderLeft: `2px solid ${r.active ? "var(--accent)" : "transparent"}`,
              background: r.active ? "var(--panel-2)" : "transparent",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: r.active ? 600 : 400 }}>{r.symbol}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color }}>{r.close?.toFixed(2) ?? "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginTop: 1 }}>
              <span style={{ fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color }}>{fmtPct(r.pct, 2)}</span>
            </div>
          </div>
        );
      })}
      {/* Set expectations rather than leaving the rail looking half-built. */}
      <div style={{ fontSize: 10, color: "var(--muted)", padding: "8px 12px", borderTop: "1px solid var(--border)", lineHeight: 1.5 }}>
        Benchmarks are read-only. Multi-position portfolios come later.
      </div>
    </div>
  );
}
