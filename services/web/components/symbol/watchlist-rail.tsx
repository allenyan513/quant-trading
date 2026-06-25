"use client";

/**
 * Left rail of the symbol workbench: the user's watchlist as a compact symbol
 * switcher (IBKR-style). Group tabs + a list of symbol · price · change · verdict.
 * Clicking a symbol navigates to it while PRESERVING the active tab segment, so you
 * can flip through names on the same view. Read-only; reuses the watchlist queries.
 */

import { useState } from "react";
import { useRouter, useParams, useSelectedLayoutSegment } from "next/navigation";
import { useLive } from "@/components/live";
import { fmtMoney } from "@/lib/format";

interface RailRow {
  symbol: string;
  price: number | null;
  changePct: number | null;
  verdict: string | null;
  listId: string | null;
}
interface WL {
  id: string;
  name: string;
}

const verdictDot: Record<string, string> = {
  undervalued: "#3fb950",
  fairly_valued: "#8a97ab",
  overvalued: "#f85149",
};

export function WatchlistRail({ symbol }: { symbol: string }) {
  const router = useRouter();
  const params = useParams<{ symbol: string }>();
  const seg = useSelectedLayoutSegment() ?? "chart";
  const active = (params.symbol ?? symbol).toUpperCase();
  const { data: rows } = useLive<RailRow[]>("/api/watchlist");
  const { data: lists } = useLive<WL[]>("/api/watchlist/lists");
  const [group, setGroup] = useState<string>("all");

  const shown = (rows ?? []).filter((r) => group === "all" || r.listId === group);

  function open(sym: string) {
    if (sym.toUpperCase() === active) return;
    router.push(`/workspace/data/symbol/${encodeURIComponent(sym)}/${seg}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border)", maxHeight: "calc(100vh - 90px)", position: "sticky", top: 0 }}>
      <div style={{ display: "flex", gap: 2, padding: 6, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <button onClick={() => setGroup("all")} style={tab(group === "all")}>All</button>
        {(lists ?? []).map((l) => (
          <button key={l.id} onClick={() => setGroup(l.id)} style={tab(group === l.id)}>{l.name}</button>
        ))}
      </div>
      <div style={{ overflowY: "auto" }}>
        {shown.length === 0 && <div style={{ padding: 12, fontSize: 12, color: "var(--muted)" }}>No symbols.</div>}
        {shown.map((r) => {
          const on = r.symbol.toUpperCase() === active;
          const chg = r.changePct;
          return (
            <button
              key={r.symbol}
              onClick={() => open(r.symbol)}
              title={r.symbol}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                border: "none",
                borderBottom: "1px solid var(--border)",
                borderLeft: `2px solid ${on ? "var(--accent)" : "transparent"}`,
                background: on ? "var(--panel-2)" : "transparent",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: r.verdict ? (verdictDot[r.verdict] ?? "#8a97ab") : "transparent", border: r.verdict ? "none" : "1px solid var(--border)", flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{r.symbol}</span>
              </span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                <span style={{ fontSize: 12 }}>{fmtMoney(r.price)}</span>
                <span style={{ display: "block", fontSize: 11, color: chg == null ? "var(--muted)" : chg >= 0 ? "#3fb950" : "#f85149" }}>
                  {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const tab = (on: boolean): React.CSSProperties => ({
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid transparent",
  background: on ? "var(--panel-2)" : "transparent",
  color: on ? "var(--accent)" : "var(--muted)",
  cursor: "pointer",
});
