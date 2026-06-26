"use client";

/**
 * Portfolio header: a Paper | Live segmented toggle over the section. "Live" is the
 * read-only IBKR account (the existing positions/performance/trades/… tabs); "Paper"
 * is the per-user, order-driven simulated account (single page). The Live sub-tabs
 * only show in Live mode; Paper has no sub-tabs.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SectionTabs, type TabDef } from "@/components/section-tabs";

const LIVE_TABS: TabDef[] = [
  { seg: "positions", label: "Positions" },
  { seg: "performance", label: "Performance" },
  { seg: "trades", label: "Trades" },
  { seg: "morning-brief", label: "Morning brief" },
  { seg: "settings", label: "Settings" },
];

export function PortfolioNav() {
  const pathname = usePathname();
  const isPaper = pathname.startsWith("/workspace/portfolio/paper");
  return (
    <div>
      <div style={{ display: "inline-flex", gap: 2, border: "1px solid var(--border)", borderRadius: 8, padding: 2, margin: "4px 0 12px" }}>
        <Link href="/workspace/portfolio/paper" style={seg(isPaper)}>Paper</Link>
        <Link href="/workspace/portfolio/positions" style={seg(!isPaper)}>Live · IBKR</Link>
      </div>
      {!isPaper && <SectionTabs base="/workspace/portfolio" tabs={LIVE_TABS} defaultSeg="positions" margin="0 0 16px" />}
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
