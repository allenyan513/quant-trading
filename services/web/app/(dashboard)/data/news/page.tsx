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
  // Triage (data-prep agent, issue #59)
  screenPassed: boolean | null;
  screenFailedRule: string | null;
  screenDetail: Record<string, unknown> | null;
  triageSymbol: string | null;
  triageMaterial: boolean | null;
  triagePriority: string | null;
  triageRationale: string | null;
  triagedAt: string | null;
}

const CATEGORIES = [
  { value: "stock", label: "Stock" },
  { value: "general", label: "General" },
  { value: "press_release", label: "Press" },
  { value: "fmp_article", label: "FMP" },
];

const PRIORITIES = [
  { value: "high", label: "High" },
  { value: "med", label: "Med" },
  { value: "low", label: "Low" },
];

const catColor: Record<string, string> = {
  stock: "#58a6ff",
  general: "#8a97ab",
  press_release: "#a371f7",
  fmp_article: "#3fb950",
};

// Actionable priorities are colored (red/amber/blue); "ignore" states are gray.
const prioColor: Record<string, string> = {
  high: "#f85149",
  med: "#d29922",
  low: "#58a6ff",
};
const NEUTRAL = "#8a97ab"; // noise / pending
const FAINT = "#6e7681"; // filtered (didn't reach the LLM)

function refreshNews() {
  return mutate((k) => typeof k === "string" && k.startsWith("/api/news"));
}

/** Top control: pull market-wide FMP news into staging, then screen + triage it
 * (deterministic rule pipeline → Haiku triage agent). Neither touches alpha. */
function PullBar() {
  const [days, setDays] = useState(1);
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
        data?: { pulled: number; inserted: number; queued: number; byCategory: Record<string, number> };
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
      alert(`Pulled ${d.pulled}, ${d.inserted} new in staging, ${d.queued} auto-queued for triage\n${by}`);
      await refreshNews();
    } finally {
      setBusy(false);
    }
  }

  async function triage() {
    setBusy(true);
    try {
      const res = await fetch("/api/news/triage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { considered: number; triaged: number; screenedOut: number; failed: number };
        error?: string;
      };
      if (!res.ok || !j.ok) {
        alert(`triage failed: ${j.error ?? res.status}`);
        return;
      }
      const d = j.data!;
      alert(`Triaged ${d.considered}: passed ${d.triaged} · screened out ${d.screenedOut} · failed ${d.failed}`);
      await refreshNews();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
      <label style={{ fontSize: 13, color: "var(--muted)" }}>
        Last{" "}
        <input
          type="number"
          min={1}
          max={90}
          value={days}
          onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
          style={{ ...inputStyle, width: 64, minWidth: 0 }}
        />{" "}
        days
      </label>
      <button onClick={pull} disabled={busy} style={primaryBtn(busy)}>
        {busy ? "Pulling…" : "Pull news"}
      </button>
      <button onClick={triage} disabled={busy} style={ghostBtn(busy)}>
        {busy ? "Processing…" : "Triage pending"}
      </button>
    </div>
  );
}

export default function NewsPage() {
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [symbol, setSymbol] = useState("");
  const [priority, setPriority] = useState("");
  const [busy, setBusy] = useState(false);

  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (status) qs.set("status", status);
  if (symbol) qs.set("symbol", symbol.toUpperCase());
  if (priority) qs.set("priority", priority);
  qs.set("limit", "200");
  const url = `/api/news?${qs}`;

  const { data, error, isLoading } = useLive<NewsRow[]>(url);
  const rows = useMemo(() => data ?? [], [data]);

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
      alert(`Notified ${d.notified} (bundled into ${d.notifications} notifications sent to alpha)${d.skipped ? `, skipped ${d.skipped} with no ticker` : ""}`);
      await refreshNews();
    } finally {
      setBusy(false);
    }
  }

  function notifyOne(r: NewsRow) {
    // Prefer the triage agent's resolved symbol over the article's raw tag.
    const sym = r.triageSymbol ?? r.symbol;
    if (!sym) {
      const s = window.prompt("This article has no ticker. Enter the symbol to notify alpha (leave blank to cancel):")?.trim();
      if (!s) return;
      void postNotify([r.id], { [r.id]: s.toUpperCase() });
      return;
    }
    // Pass the resolved symbol as an override so notify uses triage's pick.
    void postNotify([r.id], { [r.id]: sym.toUpperCase() });
  }

  return (
    <div>
      <PageTitle subsystem="data" sub="Pull FMP market news → screen + LLM triage (priority / materiality) → manual review → notify alpha (issue #59)">
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
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
          <option value="">Priority: all</option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <input placeholder="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inputStyle} />
        <span style={{ alignSelf: "center", fontSize: 12, color: "var(--muted)" }}>
          {isLoading ? "loading…" : `${rows.length} rows · live 5s`}
        </span>
      </div>

      {error && <div style={{ color: "#f85149", marginBottom: 8 }}>Error: {String(error.message ?? error)}</div>}

      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
        <table>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 128 }}>Published</th>
              <th style={{ ...thStyle, width: 80 }}>Feed</th>
              <th style={{ ...thStyle, width: 80 }}>Symbol</th>
              <th style={thStyle}>Title</th>
              <th style={{ ...thStyle, width: 150 }}>Triage</th>
              <th style={{ ...thStyle, width: 120 }}>Site</th>
              <th style={{ ...thStyle, width: 80 }}>Status</th>
              <th style={{ ...thStyle, width: 110 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, color: "var(--muted)" }}>
                  No staged news — click Pull news.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const notified = r.status === "notified";
              return (
              <tr key={r.id} style={{ opacity: notified ? 0.5 : 1 }}>
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
                <td style={tdStyle}>
                  <TriageCell r={r} />
                </td>
                <td style={{ ...tdStyle, color: "var(--muted)" }}>{r.site ?? "—"}</td>
                <td style={tdStyle}>
                  <StatusBadge status={r.status} />
                </td>
                <td style={tdStyle}>
                  <button onClick={() => notifyOne(r)} disabled={busy || notified} style={smallBtn(busy || notified)}>
                    {notified ? "Notified" : "Notify alpha"}
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Triage verdict cell: priority badge + materiality, or the screen-out reason
 * / "untriaged". Rationale shows on hover. */
/** Compact USD for market cap, e.g. 4.2e8 -> "$420M", 1.2e9 -> "$1.2B". */
function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "?";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${Math.round(n / 1e6)}M`;
  return `$${Math.round(n)}`;
}

interface TriageLabel {
  text: string; // primary chip word
  color: string; // chip color (semantic)
  sub?: string; // one-line gray "why" under the chip
  tip?: string; // full detail on hover
}

/**
 * Map a news row's triage state to one human-readable chip. Six mutually-
 * exclusive states; actionable ones (High/Med/Low) are colored, ignore-able ones
 * (Noise/Filtered/Pending) are gray. Pure — easy to eyeball and reuse.
 */
function triageLabel(r: NewsRow): TriageLabel {
  if (!r.triagedAt) return { text: "Pending", color: NEUTRAL };

  // Filtered by the deterministic screen — never reached the LLM.
  if (r.screenPassed === false) {
    const d = (r.screenDetail ?? {}) as { reason?: string; marketCap?: number };
    const reason = d.reason ?? r.screenFailedRule ?? "";
    const sub =
      reason === "no_symbol"
        ? "No ticker"
        : reason === "market_cap_below_min"
          ? `Small cap · ${fmtUsd(d.marketCap ?? NaN)}`
          : reason === "market_cap_unknown"
            ? "Market cap unknown"
            : reason || "screened out";
    return { text: "Filtered", color: FAINT, sub, tip: `screen: ${reason}` };
  }

  // Passed the screen → LLM verdict.
  if (r.triageMaterial === false) {
    return { text: "Noise", color: NEUTRAL, sub: "not a catalyst", tip: r.triageRationale ?? undefined };
  }
  const p = r.triagePriority ?? "";
  const word = p === "high" ? "High" : p === "med" ? "Med" : p === "low" ? "Low" : p || "—";
  return { text: word, color: prioColor[p] ?? NEUTRAL, tip: r.triageRationale ?? undefined };
}

function TriageCell({ r }: { r: NewsRow }) {
  const lbl = triageLabel(r);
  return (
    <span
      title={lbl.tip ?? ""}
      style={{ display: "inline-flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}
    >
      <Badge color={lbl.color}>{lbl.text}</Badge>
      {lbl.sub && <span style={{ fontSize: 11, color: "var(--muted)" }}>{lbl.sub}</span>}
    </span>
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

const ghostBtn = (busy: boolean): React.CSSProperties => ({
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text)",
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
