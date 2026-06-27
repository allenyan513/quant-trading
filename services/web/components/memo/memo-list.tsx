"use client";

/**
 * Memo workspace — the top-level list of the user's investment memos, newest first,
 * plus a MINIMAL compose box (not a rich editor — the primary authoring surface is the
 * user's own Claude via the MCP submit_memo tool). Memos authored either way land here.
 */
import { useState } from "react";
import Link from "next/link";
import { useLive } from "@/components/live";
import { Badge } from "@/components/ui";
import { PageTitle } from "@/components/page-title";
import { apiSend } from "@/lib/api-client";
import { fmtDate } from "@/lib/format";
import { MEMO_TYPE_COLOR, DIRECTION_COLOR, type MemoView } from "./types";

const TYPES = ["thesis", "review", "weekly", "research", "reflection", "note", "morning_call"] as const;

export function MemoList() {
  const [typeFilter, setTypeFilter] = useState<string>("");
  const url = `/api/memos?limit=100${typeFilter ? `&type=${typeFilter}` : ""}`;
  const { data, error, mutate } = useLive<MemoView[]>(url);

  return (
    <div>
      <PageTitle sub="Theses, reviews & notes — anchored to a point-in-time snapshot">Memos</PageTitle>

      <Compose onSaved={() => mutate()} />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "14px 0 10px" }}>
        <FilterChip label="All" active={typeFilter === ""} onClick={() => setTypeFilter("")} />
        {TYPES.map((t) => (
          <FilterChip key={t} label={t} active={typeFilter === t} color={MEMO_TYPE_COLOR[t]} onClick={() => setTypeFilter(t)} />
        ))}
      </div>

      {error && <div style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</div>}
      {data && data.length === 0 && <div style={{ color: "var(--muted)", padding: 16, border: "1px solid var(--border)", borderRadius: 10 }}>No memos yet.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data?.map((m) => (
          <Link
            key={m.id}
            href={`/workspace/memo/${m.id}`}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", textDecoration: "none", flexWrap: "wrap" }}
          >
            {m.pinned && <span title="Pinned" style={{ color: "#d29922" }}>★</span>}
            <Badge color={MEMO_TYPE_COLOR[m.type]}>{m.type}</Badge>
            {m.direction && <Badge color={DIRECTION_COLOR[m.direction]}>{m.direction}</Badge>}
            {m.status !== "active" && <Badge color="#8a97ab">{m.status}</Badge>}
            <span style={{ fontWeight: 600 }}>{m.title}</span>
            <span style={{ display: "flex", gap: 5 }}>
              {m.symbols.map((s) => (
                <span key={s.symbol} style={{ fontSize: 11.5, color: "#58a6ff", fontWeight: 600 }}>
                  {s.symbol}
                </span>
              ))}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)" }}>{fmtDate(m.createdAt)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function FilterChip({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12,
        padding: "3px 10px",
        borderRadius: 999,
        cursor: "pointer",
        border: `1px solid ${active ? (color ?? "var(--text)") : "var(--border)"}`,
        background: active ? "var(--panel-2)" : "transparent",
        color: active ? "var(--text)" : "var(--muted)",
        textTransform: "capitalize",
      }}
    >
      {label}
    </button>
  );
}

function Compose({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("note");
  const [title, setTitle] = useState("");
  const [symbols, setSymbols] = useState("");
  const [direction, setDirection] = useState<string>("");
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    if (busy) return;
    if (!title.trim() || !markdown.trim()) {
      setMsg({ ok: false, text: "Title and body are required" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const syms = symbols.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
      const r = await apiSend("/api/memos", "POST", { type, title: title.trim(), markdown, symbols: syms, direction: direction || undefined });
      if (!r.ok) {
        setMsg({ ok: false, text: r.error ?? "Failed" });
        return;
      }
      setTitle("");
      setSymbols("");
      setMarkdown("");
      setDirection("");
      setMsg({ ok: true, text: "Saved" });
      setOpen(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={newBtn}>
        + New memo
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid var(--border)", borderRadius: 10, padding: 14, maxWidth: 780 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={input}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={direction} onChange={(e) => setDirection(e.target.value)} style={input}>
          <option value="">no direction</option>
          <option value="long">long</option>
          <option value="short">short</option>
          <option value="neutral">neutral</option>
        </select>
        <input placeholder="Symbols (e.g. NVDA, TSM)" value={symbols} onChange={(e) => setSymbols(e.target.value)} style={{ ...input, flex: 1, minWidth: 160 }} />
      </div>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
      <textarea placeholder="Write your memo in Markdown…" value={markdown} onChange={(e) => setMarkdown(e.target.value)} rows={6} style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={save} disabled={busy} style={{ ...newBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : "Save memo"}
        </button>
        <button onClick={() => setOpen(false)} style={{ ...newBtn, background: "transparent", color: "var(--muted)" }}>
          Cancel
        </button>
        {msg && <span style={{ fontSize: 12, color: msg.ok ? "#3fb950" : "#f85149" }}>{msg.text}</span>}
      </div>
      <span style={{ fontSize: 11, color: "var(--muted)" }}>A point-in-time snapshot (price / valuation / your position) is captured for each symbol.</span>
    </div>
  );
}

const input: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  padding: "6px 9px",
  fontSize: 13,
};

const newBtn: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  padding: "7px 12px",
  fontSize: 13,
  cursor: "pointer",
};
