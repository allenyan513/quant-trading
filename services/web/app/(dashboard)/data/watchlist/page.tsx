"use client";

import { useState } from "react";
import Link from "next/link";
import { mutate } from "swr";
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge, StatusBadge, TimeText } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";

const refresh = () => mutate((k) => typeof k === "string" && k.startsWith("/api/watchlist"));

interface WatchRow {
  symbol: string;
  source: string;
  addedAt: string;
  expiresAt: string | null;
  sector: string | null;
  fairValue: number | null;
  price: number | null;
  upsidePct: number | null;
  verdict: string | null;
  held: boolean;
  shares: number | null;
  entryPrice: number | null;
}

/** Top control: manually add a symbol to the watchlist. */
function AddBar() {
  const [sym, setSym] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    if (busy) return; // guard against double-submit (Enter spam while in flight)
    const symbol = sym.trim().toUpperCase();
    if (!symbol) return;
    setBusy(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(`add failed: ${j.error ?? res.status}`);
        return;
      }
      setSym("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
      <input
        placeholder="Add symbol (e.g. NVDA)"
        value={sym}
        onChange={(e) => setSym(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "6px 10px", fontSize: 13, minWidth: 200 }}
      />
      <button
        onClick={add}
        disabled={busy}
        style={{ background: "#1f6feb", border: "1px solid #388bfd", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}
      >
        {busy ? "添加中…" : "添加"}
      </button>
    </div>
  );
}

function RemoveButton({ symbol }: { symbol: string }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`从 watchlist 移除 ${symbol}？`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(`remove failed: ${j.error ?? res.status}`);
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        disabled={busy}
        onClick={remove}
        style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, cursor: busy ? "default" : "pointer", border: "1px solid #f85149", background: "transparent", color: "#f85149", opacity: busy ? 0.5 : 1 }}
      >
        移除
      </button>
    </span>
  );
}

const verdictColor: Record<string, string> = {
  undervalued: "#3fb950",
  fairly_valued: "#8a97ab",
  overvalued: "#f85149",
};

const columns: Column<WatchRow>[] = [
  {
    key: "symbol",
    header: "Symbol",
    render: (r) => (
      <Link href={`/symbol/${r.symbol}`} style={{ textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
        <Badge>{r.symbol}</Badge>
      </Link>
    ),
    width: 90,
  },
  { key: "sector", header: "Sector", render: (r) => <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.sector ?? "—"}</span> },
  { key: "price", header: "Price", render: (r) => fmtMoney(r.price) },
  { key: "fairValue", header: "Fair value", render: (r) => fmtMoney(r.fairValue) },
  {
    key: "upsidePct",
    header: "Upside",
    render: (r) =>
      r.upsidePct == null ? (
        <span style={{ color: "var(--muted)" }}>—</span>
      ) : (
        <span style={{ color: r.upsidePct >= 0 ? "#3fb950" : "#f85149", fontWeight: 600 }}>{fmtPct(r.upsidePct)}</span>
      ),
    width: 90,
  },
  {
    key: "verdict",
    header: "Verdict",
    render: (r) => (r.verdict ? <Badge color={verdictColor[r.verdict] ?? "#8a97ab"}>{r.verdict}</Badge> : <span style={{ color: "var(--muted)" }}>no valuation</span>),
  },
  {
    key: "held",
    header: "Position",
    render: (r) =>
      r.held ? <Badge color="#58a6ff">held · {r.shares ?? "?"}</Badge> : <span style={{ color: "var(--muted)" }}>—</span>,
  },
  { key: "source", header: "Source", render: (r) => <Badge>{r.source}</Badge>, width: 90 },
  { key: "addedAt", header: "Added", render: (r) => <TimeText ts={r.addedAt} />, width: 120 },
  { key: "actions", header: "", render: (r) => <RemoveButton symbol={r.symbol} />, width: 70 },
];

export default function WatchlistPage() {
  return (
    <div>
      <PageTitle subsystem="data" sub="深挖标的 · 估值 gap / 买入区（fair value vs price）· 是否持有">
        Watchlist
      </PageTitle>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: 13 }}>
        按 upside 降序（最被低估在前 = 当前买入区）。估值由 alpha 的 <code>/internal/valuation-sweep</code> 每日刷新。
      </p>
      <AddBar />
      <LiveTable
        path="/api/watchlist"
        rowKey={(r: WatchRow) => r.symbol}
        columns={columns}
        emptyText="Watchlist 为空 — 上方添加，或在 Candidates 页 promote。"
      />
    </div>
  );
}
