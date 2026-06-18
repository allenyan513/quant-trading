"use client";

import { useState } from "react";
import Link from "next/link";
import { mutate } from "swr";
import { useLive } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { TimeText } from "@/components/ui";

interface Row {
  symbol: string;
  note: string | null;
  addedAt: string;
}

const KEY = "/api/user-watchlist";

export default function MyWatchlistPage() {
  const { data, isLoading } = useLive<Row[]>(KEY);
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) setErr(j.error ?? `添加失败（${res.status}）`);
      else setSymbol("");
      await mutate(KEY);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(sym: string) {
    await fetch(`${KEY}/remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol: sym }),
    });
    await mutate(KEY);
  }

  const rows = data ?? [];
  return (
    <div style={{ maxWidth: 560 }}>
      <PageTitle subsystem="data" sub="你私有的关注列表(与全局 house 发现宇宙分开)">
        我的自选
      </PageTitle>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="代码,如 NVDA"
          style={{
            flex: 1,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
          }}
        />
        <button
          onClick={add}
          disabled={busy || !symbol.trim()}
          style={{
            background: "#238636",
            border: "1px solid #2ea043",
            color: "#fff",
            fontWeight: 600,
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            cursor: busy ? "default" : "pointer",
            opacity: busy || !symbol.trim() ? 0.5 : 1,
          }}
        >
          添加
        </button>
      </div>
      {err && <p style={{ color: "#f85149", fontSize: 13 }}>⚠️ {err}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} style={{ borderBottom: "1px solid #21262d" }}>
              <td style={{ padding: "8px 8px", fontWeight: 600 }}>
                <Link href={`/data/symbol/${r.symbol}`} style={{ color: "#58a6ff" }}>
                  {r.symbol}
                </Link>
              </td>
              <td style={{ padding: "8px 8px", color: "#8a97ab" }}>{r.note ?? ""}</td>
              <td style={{ padding: "8px 8px", color: "#6e7681", whiteSpace: "nowrap" }}>
                <TimeText ts={r.addedAt} />
              </td>
              <td style={{ padding: "8px 8px", textAlign: "right" }}>
                <button
                  onClick={() => remove(r.symbol)}
                  title="移除"
                  style={{ background: "transparent", border: "none", color: "#8a97ab", cursor: "pointer", fontSize: 15 }}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: "16px 8px", color: "#8a97ab" }}>
                {isLoading ? "加载中…" : "还没有自选。上面输入代码添加。"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
