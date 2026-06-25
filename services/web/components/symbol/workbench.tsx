"use client";

/**
 * 3-pane shell for the per-symbol detail page (IBKR-style, research-oriented):
 * [ watchlist rail | center tabs+content | decision panel ]. The grid + responsive
 * collapse live in globals.css (`.symbol-workbench`); the left rail toggles via a
 * class. The center keeps the existing SymbolTabs + the routed tab content.
 */

import { useState } from "react";
import { PanelLeft } from "lucide-react";
import { SymbolTabs } from "@/components/symbol-tabs";
import { WatchlistRail } from "@/components/symbol/watchlist-rail";
import { DecisionPanel } from "@/components/symbol/decision-panel";

export function SymbolWorkbench({ symbol, children }: { symbol: string; children: React.ReactNode }) {
  const [railOpen, setRailOpen] = useState(true);
  return (
    <div className={`symbol-workbench${railOpen ? "" : " rail-collapsed"}`}>
      <aside className="symbol-rail">
        <WatchlistRail symbol={symbol} />
      </aside>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button onClick={() => setRailOpen((o) => !o)} title="Toggle watchlist" style={iconBtn}>
            <PanelLeft size={16} strokeWidth={1.75} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 800 }}>{symbol}</span>
        </div>
        <SymbolTabs />
        {children}
      </div>

      <aside className="symbol-decision">
        <DecisionPanel symbol={symbol} />
      </aside>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  border: "1px solid var(--border)",
  background: "var(--panel-2)",
  color: "var(--muted)",
  cursor: "pointer",
};
