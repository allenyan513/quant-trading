"use client";

/**
 * Portfolio header: the Live | Paper | Strategy segmented toggle (3 ledgers). The
 * active ledger is the App Router's selected layout segment (live/paper/strategy);
 * each ledger's own sub-tabs (Positions / Activity / …) are rendered by its nested
 * layout, so this is just the top-level ledger switch.
 */

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

const LEDGERS = [
  { seg: "live", label: "Live · IBKR" },
  { seg: "paper", label: "Paper" },
  { seg: "strategy", label: "Strategy" },
];

export function PortfolioNav() {
  const active = useSelectedLayoutSegment() ?? "live";
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
