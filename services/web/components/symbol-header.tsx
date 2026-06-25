"use client";

/**
 * Shared company header for the per-symbol detail layout. Reads the DB-only
 * "company shell" (identity + latest price/verdict/upside) and offers
 * add-to-watchlist + a refresh-data action. Rendered once by the layout,
 * persists across tabs.
 */

import { useState } from "react";
import { mutate } from "swr";
import { useLive } from "@/components/live";
import { apiAction } from "@/lib/api-client";
import { StatusBadge } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";

interface Shell {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  price: number | null;
  fairValue: number | null;
  upsidePct: number | null;
  verdict: string | null;
  asOf: string | null;
  inWatchlist: boolean;
}

/** Reflects + toggles watchlist membership. Adds when not in the list, removes
 * (with confirm) when already in. `added` is server truth (shell.inWatchlist)
 * with an optimistic local override that holds until the shell revalidates. */
function WatchlistToggle({ symbol, inWatchlist }: { symbol: string; inWatchlist: boolean }) {
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<boolean | null>(null);
  const added = local ?? inWatchlist;
  const shellKey = `/api/data/symbol/${symbol}/shell`;

  async function toggle() {
    if (busy) return;
    if (added && !window.confirm(`Remove ${symbol} from watchlist?`)) return;
    setBusy(true);
    try {
      const ok = added
        ? await apiAction(`/api/watchlist/${encodeURIComponent(symbol)}`, "DELETE")
        : await apiAction("/api/watchlist", "POST", { symbol });
      if (ok) {
        setLocal(!added);
        mutate(shellKey);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={added ? "Click to remove from watchlist" : "Add to watchlist"}
      style={{
        background: added ? "transparent" : "#1f6feb",
        border: `1px solid ${added ? "var(--border)" : "#388bfd"}`,
        color: added ? "var(--muted)" : "#fff",
        borderRadius: 8,
        padding: "6px 14px",
        fontSize: 13,
        fontWeight: 600,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {busy ? "…" : added ? "✓ In watchlist" : "+ Add to watchlist"}
    </button>
  );
}

/** Warms this symbol's marketdata caches on demand (forwards to the data
 * service, which has FMP access). Fills statements/ratios/prices so the Chart &
 * Financials tabs populate, then revalidates every symbol-scoped SWR key. */
function RefreshButton({ symbol }: { symbol: string }) {
  const [busy, setBusy] = useState(false);
  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      if (await apiAction(`/api/data/symbol/${encodeURIComponent(symbol)}/warm`, "POST")) {
        // Revalidate shell/overview/financials/prices (/api/data/symbol/<sym>/…)
        // AND the news tab (/api/news?symbol=<sym>…), since warm now also pulls
        // this symbol's news. Match both raw and URL-encoded keys (BRK/B etc.).
        const enc = encodeURIComponent(symbol);
        await mutate(
          (k) =>
            typeof k === "string" &&
            (k.startsWith(`/api/data/symbol/${symbol}/`) ||
              k.startsWith(`/api/data/symbol/${enc}/`) ||
              k.startsWith(`/api/data/valuation/${symbol}`) ||
              k.startsWith(`/api/data/valuation/${enc}`) ||
              k.startsWith(`/api/news?symbol=${symbol}`) ||
              k.startsWith(`/api/news?symbol=${enc}`)),
        );
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={refresh}
      disabled={busy}
      title="Pull from FMP and warm this symbol's financials/daily-bar caches (used by Chart and Financials)"
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        color: "var(--muted)",
        borderRadius: 8,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 600,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {busy ? "Refreshing…" : "⟳ Refresh data"}
    </button>
  );
}

export function SymbolHeader({ symbol }: { symbol: string }) {
  const { data } = useLive<Shell | null>(`/api/data/symbol/${symbol}/shell`);
  const s = data ?? null;
  const upColor = s?.upsidePct == null ? "var(--muted)" : s.upsidePct >= 0 ? "#3fb950" : "#f85149";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 4,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{symbol}</h1>
          {s?.verdict && <StatusBadge status={s.verdict} />}
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
          {s?.name ?? "—"}
          {s?.sector && <span> · {s.sector}</span>}
          {s?.industry && <span> · {s.industry}</span>}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMoney(s?.price)}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            fair {fmtMoney(s?.fairValue)} · upside{" "}
            <span style={{ color: upColor, fontWeight: 600 }}>{fmtPct(s?.upsidePct)}</span>
          </div>
        </div>
        <RefreshButton symbol={symbol} />
        <WatchlistToggle symbol={symbol} inWatchlist={s?.inWatchlist ?? false} />
      </div>
    </div>
  );
}
