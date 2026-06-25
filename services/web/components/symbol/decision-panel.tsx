"use client";

/**
 * Right-rail decision panel for the symbol workbench — the research counterpart to
 * IBKR's order-entry rail. Answers "is this a buy at today's price, and how much do
 * I hold?": quote → valuation verdict + fair value/upside → your position → watchlist
 * + refresh actions. No order entry. Reads the DB-only "company shell" + holdings.
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

interface Position {
  symbol: string;
  assetClass: string;
  quantity: number;
  avgPrice: number | null;
  markPrice: number | null;
  positionValue: number | null;
  weightPct: number | null;
}

const VERDICT_HEADLINE: Record<string, string> = {
  undervalued: "Trading below fair value",
  fairly_valued: "Around fair value",
  overvalued: "Trading above fair value",
};

export function DecisionPanel({ symbol }: { symbol: string }) {
  const { data: shell } = useLive<Shell | null>(`/api/data/symbol/${symbol}/shell`);
  const { data: holdings } = useLive<{ positions: Position[] }>(`/api/holdings/positions`);
  const s = shell ?? null;
  const pos = (holdings?.positions ?? []).find((p) => p.symbol === symbol && p.assetClass !== "OPT");
  const upColor = s?.upsidePct == null ? "var(--muted)" : s.upsidePct >= 0 ? "#3fb950" : "#f85149";
  const retPct =
    pos && pos.avgPrice && pos.avgPrice !== 0 && pos.markPrice != null ? ((pos.markPrice - pos.avgPrice) / pos.avgPrice) * 100 : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)" }}>
      {/* Quote */}
      <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{symbol}</span>
          {s?.verdict && <StatusBadge status={s.verdict} />}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{s?.name ?? "—"}</div>
        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(s?.price)}</div>
        {s?.sector && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.sector}{s.industry ? ` · ${s.industry}` : ""}</div>}
      </div>

      {/* Valuation verdict + buy zone */}
      <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
        <div style={kpiRow}>
          <span style={kpiLabel}>Fair value</span>
          <span style={kpiVal}>{fmtMoney(s?.fairValue)}</span>
        </div>
        <div style={kpiRow}>
          <span style={kpiLabel}>Upside</span>
          <span style={{ ...kpiVal, color: upColor, fontWeight: 700 }}>{fmtPct(s?.upsidePct)}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          {s?.verdict ? (VERDICT_HEADLINE[s.verdict] ?? "—") : "No reference valuation yet"}
          {s?.asOf && <span> · as of {s.asOf}</span>}
        </div>
      </div>

      {/* Your position */}
      <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
          Your position
        </div>
        {pos ? (
          <>
            <div style={kpiRow}><span style={kpiLabel}>Shares</span><span style={kpiVal}>{pos.quantity}</span></div>
            <div style={kpiRow}><span style={kpiLabel}>Avg cost</span><span style={kpiVal}>{fmtMoney(pos.avgPrice)}</span></div>
            <div style={kpiRow}><span style={kpiLabel}>Market value</span><span style={kpiVal}>{fmtMoney(pos.positionValue)}</span></div>
            <div style={kpiRow}>
              <span style={kpiLabel}>Return</span>
              <span style={{ ...kpiVal, color: retPct == null ? "var(--muted)" : retPct >= 0 ? "#3fb950" : "#f85149", fontWeight: 700 }}>{fmtPct(retPct)}</span>
            </div>
            {pos.weightPct != null && <div style={kpiRow}><span style={kpiLabel}>Weight</span><span style={kpiVal}>{pos.weightPct.toFixed(1)}%</span></div>}
          </>
        ) : (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Not held</div>
        )}
      </div>

      {/* Actions — watchlist toggle is primary; data auto-refreshes on open, so
          refresh is just a tiny "force now" override. */}
      <div style={{ padding: 12, display: "flex", gap: 8 }}>
        <div style={{ flex: 1, display: "flex" }}>
          <WatchlistToggle symbol={symbol} inWatchlist={s?.inWatchlist ?? false} />
        </div>
        <ForceRefresh symbol={symbol} />
      </div>
    </div>
  );
}

/** Reflects + toggles watchlist membership (optimistic local override until the shell revalidates). */
function WatchlistToggle({ symbol, inWatchlist }: { symbol: string; inWatchlist: boolean }) {
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<boolean | null>(null);
  const added = local ?? inWatchlist;
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
        mutate(`/api/data/symbol/${symbol}/shell`);
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
        width: "100%",
        background: added ? "transparent" : "#1f6feb",
        border: `1px solid ${added ? "var(--border)" : "#388bfd"}`,
        color: added ? "var(--muted)" : "#fff",
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 600,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? "…" : added ? "✓ In watchlist" : "+ Add to watchlist"}
    </button>
  );
}

/** Tiny "force refresh now" override — warms this symbol's caches (bypassing the
 *  24h auto-refresh gate) and revalidates symbol-scoped SWR keys. The page already
 *  auto-refreshes on open, so this is rarely needed. */
function ForceRefresh({ symbol }: { symbol: string }) {
  const [busy, setBusy] = useState(false);
  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      if (await apiAction(`/api/data/symbol/${encodeURIComponent(symbol)}/warm`, "POST")) {
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
      title="Force-refresh now (data also auto-refreshes when you open a symbol)"
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        color: "var(--muted)",
        padding: "8px 11px",
        fontSize: 15,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? "…" : "⟳"}
    </button>
  );
}

const kpiRow: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, padding: "2px 0" };
const kpiLabel: React.CSSProperties = { fontSize: 12, color: "var(--muted)" };
const kpiVal: React.CSSProperties = { fontSize: 13, fontVariantNumeric: "tabular-nums" };
