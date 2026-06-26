"use client";

/**
 * Per-ledger sub-tab bar — the SAME tab set for Live and Paper (Positions / Activity
 * / Performance / Morning brief / Settings); only the per-tab CONTENT differs by
 * ledger. "Positions" is the ledger index route; the rest are sub-routes. Sits below
 * the ledger toggle + KPI strip (both in the ledger layout).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { seg: string; label: string }[] = [
  { seg: "", label: "Positions" },
  { seg: "activity", label: "Activity" },
  { seg: "performance", label: "Performance" },
  { seg: "morning-brief", label: "Morning brief" },
  { seg: "settings", label: "Settings" },
];

export function LedgerTabs({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 4, borderBottom: "1px solid var(--border)", margin: "0 0 16px" }}>
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const active = t.seg ? pathname.startsWith(href) : pathname === base || pathname === `${base}/`;
        return (
          <Link
            key={t.seg || "positions"}
            href={href}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              color: active ? "#58a6ff" : "var(--muted)",
              borderBottom: `2px solid ${active ? "#58a6ff" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
