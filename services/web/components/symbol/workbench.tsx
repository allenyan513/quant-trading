"use client";

/**
 * 3-pane shell for the per-symbol detail page (IBKR-style, research-oriented):
 * [ watchlist rail | center tabs+content | decision panel ]. The grid + responsive
 * collapse live in globals.css (`.symbol-workbench`); the left rail toggles via a
 * class. The center keeps the existing SymbolTabs + the routed tab content.
 */

import { SymbolTabs } from "@/components/symbol-tabs";
import { WatchlistRail } from "@/components/symbol/watchlist-rail";
import { DecisionPanel } from "@/components/symbol/decision-panel";

export function SymbolWorkbench({ symbol, children }: { symbol: string; children: React.ReactNode }) {
  return (
    <div className="symbol-workbench">
      <aside className="symbol-rail">
        <WatchlistRail symbol={symbol} />
      </aside>

      <div style={{ minWidth: 0 }}>
        <SymbolTabs />
        {children}
      </div>

      <aside className="symbol-decision">
        <DecisionPanel symbol={symbol} />
      </aside>
    </div>
  );
}
