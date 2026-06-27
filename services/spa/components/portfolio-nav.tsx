"use client";

/**
 * Portfolio header: the Live | Paper segmented toggle. The active ledger is the App
 * Router's selected layout segment (live/paper); each ledger's own sub-tabs (Positions
 * / Activity / …) are rendered by its nested layout, so this is just the top-level
 * ledger switch. (Strategy is off the UI — see below.)
 */

import { useLocation } from "react-router-dom";
import Link from "@/components/link";
import { segmentAfter } from "@/lib/next-navigation";

// Strategy (the signal-driven sim) is intentionally OFF the UI for now — it's a
// half-baked ledger; its backend (strategy.ts / portfolio_positions / /jobs/track /
// /api/positions) keeps running. Re-add a polished Strategy view later.
const LEDGERS = [
  { seg: "paper", label: "Paper" },
  { seg: "live", label: "Live · IBKR" },
];

export function PortfolioNav() {
  const active = segmentAfter(useLocation().pathname, "/workspace/portfolio") ?? "paper";
  return (
    <div style={{ display: "inline-flex", gap: 2, border: "1px solid var(--border)", borderRadius: 8, padding: 2, margin: "4px 0 12px" }}>
      {LEDGERS.map((l) => (
        <Link key={l.seg} href={`/workspace/portfolio/${l.seg}`} style={seg(active === l.seg)}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

function seg(on: boolean): React.CSSProperties {
  return {
    padding: "5px 16px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    whiteSpace: "nowrap",
    color: on ? "#fff" : "var(--muted)",
    background: on ? "#1f6feb" : "transparent",
  };
}
