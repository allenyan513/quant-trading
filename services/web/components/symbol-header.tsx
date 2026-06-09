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
    setBusy(true);
    try {
      if (added) {
        if (!window.confirm(`从 watchlist 移除 ${symbol}？`)) return;
        const res = await fetch(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) return void alert(`remove failed: ${j.error ?? res.status}`);
        setLocal(false);
      } else {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ symbol }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) return void alert(`add failed: ${j.error ?? res.status}`);
        setLocal(true);
      }
      mutate(shellKey);
    } catch (e) {
      alert(`failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={added ? "点击从 watchlist 移除" : "加入 watchlist"}
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
      {busy ? "…" : added ? "✓ 已自选" : "+ 加自选"}
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
      const res = await fetch(`/api/data/symbol/${encodeURIComponent(symbol)}/warm`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(`刷新失败: ${j.error ?? res.status}`);
        return;
      }
      // Revalidate shell/overview/financials/prices for this symbol.
      await mutate((k) => typeof k === "string" && k.startsWith(`/api/data/symbol/${symbol}/`));
    } catch (e) {
      alert(`刷新失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={refresh}
      disabled={busy}
      title="从 FMP 拉取并预热该标的的财报/日线缓存（Chart、Financials 用）"
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
      {busy ? "刷新中…" : "⟳ 刷新数据"}
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
