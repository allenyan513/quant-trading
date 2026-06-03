"use client";

import { useMemo, useState } from "react";
import { mutate } from "swr";
import { useLive } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge, StatusBadge, TimeText } from "@/components/ui";

interface NewsRow {
  id: string;
  category: string;
  symbol: string | null;
  title: string | null;
  url: string | null;
  site: string | null;
  status: string;
  publishedAt: string | null;
}

const CATEGORIES = [
  { value: "stock", label: "Stock" },
  { value: "general", label: "General" },
  { value: "press_release", label: "Press" },
  { value: "fmp_article", label: "FMP" },
];

const catColor: Record<string, string> = {
  stock: "#58a6ff",
  general: "#8a97ab",
  press_release: "#a371f7",
  fmp_article: "#3fb950",
};

function refreshNews() {
  return mutate((k) => typeof k === "string" && k.startsWith("/api/news"));
}

/** Top control: pull market-wide FMP news into staging (does not touch alpha). */
function PullBar() {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  async function pull() {
    setBusy(true);
    try {
      const res = await fetch("/api/news/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { pulled: number; inserted: number; byCategory: Record<string, number> };
        error?: string;
      };
      if (!res.ok || !j.ok) {
        alert(`pull failed: ${j.error ?? res.status}`);
        return;
      }
      const d = j.data!;
      const by = Object.entries(d.byCategory)
        .map(([k, v]) => `${k}:${v}`)
        .join(" · ");
      alert(`拉取 ${d.pulled} 条，新入库 ${d.inserted} 条\n${by}`);
      await refreshNews();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
      <label style={{ fontSize: 13, color: "var(--muted)" }}>
        近{" "}
        <input
          type="number"
          min={1}
          max={90}
          value={days}
          onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
          style={{ ...inputStyle, width: 64, minWidth: 0 }}
        />{" "}
        天
      </label>
      <button onClick={pull} disabled={busy} style={primaryBtn(busy)}>
        {busy ? "拉取中…" : "拉取新闻"}
      </button>
    </div>
  );
}

export default function NewsPage() {
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [symbol, setSymbol] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (status) qs.set("status", status);
  if (symbol) qs.set("symbol", symbol.toUpperCase());
  qs.set("limit", "200");
  const url = `/api/news?${qs}`;

  const { data, error, isLoading } = useLive<NewsRow[]>(url);
  const rows = useMemo(() => data ?? [], [data]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function postNotify(ids: string[], symbolOverride: Record<string, string> = {}) {
    setBusy(true);
    try {
      const res = await fetch("/api/news/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, symbolOverride }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { notified: number; skipped: number; notifications: number };
        error?: string;
      };
      if (!res.ok || !j.ok) {
        alert(`notify failed: ${j.error ?? res.status}`);
        return;
      }
      const d = j.data!;
      alert(`已通知 ${d.notified} 条（分组成 ${d.notifications} 条通知发给 alpha）${d.skipped ? `，跳过 ${d.skipped} 条无 ticker` : ""}`);
      setSelected(new Set());
      await refreshNews();
    } finally {
      setBusy(false);
    }
  }

  function notifyOne(r: NewsRow) {
    if (!r.symbol) {
      const s = window.prompt("该新闻没有股票代码，输入要通知 alpha 的 symbol（留空取消）:")?.trim();
      if (!s) return;
      void postNotify([r.id], { [r.id]: s.toUpperCase() });
      return;
    }
    void postNotify([r.id]);
  }

  return (
    <div>
      <PageTitle subsystem="data" sub="手动拉取 FMP 市场新闻 → 选择 → 打包通知 alpha（无定时任务前的人工链路 · issue #59）">
        News
      </PageTitle>

      <PullBar />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
          <option value="">Category: all</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
          <option value="">Status: all</option>
          {["new", "notified"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <input placeholder="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inputStyle} />
        <span style={{ alignSelf: "center", fontSize: 12, color: "var(--muted)" }}>
          {isLoading ? "loading…" : `${rows.length} rows · live 5s`}
        </span>
        {selected.size > 0 && (
          <button onClick={() => postNotify([...selected])} disabled={busy} style={primaryBtn(busy)}>
            合并通知 alpha（{selected.size}）
          </button>
        )}
      </div>

      {error && <div style={{ color: "#f85149", marginBottom: 8 }}>Error: {String(error.message ?? error)}</div>}

      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
        <table>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 34 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th style={{ ...thStyle, width: 128 }}>Published</th>
              <th style={{ ...thStyle, width: 80 }}>Feed</th>
              <th style={{ ...thStyle, width: 80 }}>Symbol</th>
              <th style={thStyle}>Title</th>
              <th style={{ ...thStyle, width: 140 }}>Site</th>
              <th style={{ ...thStyle, width: 80 }}>Status</th>
              <th style={{ ...thStyle, width: 110 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, color: "var(--muted)" }}>
                  No staged news — click 拉取新闻.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} style={{ background: selected.has(r.id) ? "var(--panel-2)" : undefined }}>
                <td style={tdStyle}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td style={tdStyle}>
                  <TimeText ts={r.publishedAt} />
                </td>
                <td style={tdStyle}>
                  <Badge color={catColor[r.category] ?? "#8a97ab"}>{r.category}</Badge>
                </td>
                <td style={tdStyle}>{r.symbol ? <Badge>{r.symbol}</Badge> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                <td style={tdStyle}>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "var(--text)" }}>
                      {r.title ?? r.url}
                    </a>
                  ) : (
                    (r.title ?? "—")
                  )}
                </td>
                <td style={{ ...tdStyle, color: "var(--muted)" }}>{r.site ?? "—"}</td>
                <td style={tdStyle}>
                  <StatusBadge status={r.status} />
                </td>
                <td style={tdStyle}>
                  <button onClick={() => notifyOne(r)} disabled={busy} style={smallBtn(busy)}>
                    通知 alpha
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
  minWidth: 130,
};

const primaryBtn = (busy: boolean): React.CSSProperties => ({
  background: "#1f6feb",
  border: "1px solid #388bfd",
  color: "#fff",
  borderRadius: 8,
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: busy ? "default" : "pointer",
  opacity: busy ? 0.5 : 1,
});

const smallBtn = (busy: boolean): React.CSSProperties => ({
  fontSize: 12,
  padding: "2px 8px",
  borderRadius: 4,
  cursor: busy ? "default" : "pointer",
  border: "1px solid #a371f7",
  background: "transparent",
  color: "#a371f7",
  opacity: busy ? 0.5 : 1,
});

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "9px 12px",
  fontSize: 12,
  color: "var(--muted)",
  borderBottom: "1px solid var(--border)",
  position: "sticky",
  top: 0,
  background: "var(--panel)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "top",
  fontSize: 13,
};
