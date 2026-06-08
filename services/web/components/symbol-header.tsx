"use client";

/**
 * Shared company header for the per-symbol detail layout. Reads the DB-only
 * "company shell" (identity + latest price/verdict/upside) and offers an
 * add-to-watchlist action. Rendered once by the layout, persists across tabs.
 */

import { useState } from "react";
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
}

function AddToWatchlist({ symbol }: { symbol: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  async function add() {
    if (state !== "idle") return;
    setState("busy");
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(`add failed: ${j.error ?? res.status}`);
        setState("idle");
        return;
      }
      setState("done");
    } catch (e) {
      alert(`add failed: ${e instanceof Error ? e.message : String(e)}`);
      setState("idle");
    }
  }
  return (
    <button
      onClick={add}
      disabled={state !== "idle"}
      style={{
        background: state === "done" ? "transparent" : "#1f6feb",
        border: `1px solid ${state === "done" ? "var(--border)" : "#388bfd"}`,
        color: state === "done" ? "var(--muted)" : "#fff",
        borderRadius: 8,
        padding: "6px 14px",
        fontSize: 13,
        fontWeight: 600,
        cursor: state === "idle" ? "pointer" : "default",
        whiteSpace: "nowrap",
      }}
    >
      {state === "done" ? "✓ 已加自选" : state === "busy" ? "添加中…" : "+ 加自选"}
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
        <AddToWatchlist symbol={symbol} />
      </div>
    </div>
  );
}
