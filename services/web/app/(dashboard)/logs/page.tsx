"use client";

import Link from "next/link";
import { useState } from "react";
import { useLive } from "@/components/live";
import { Badge, StatusBadge } from "@/components/ui";
import { fmtFull } from "@/lib/format";

interface LogRow {
  id: string;
  ts: string;
  level: string;
  service: string;
  event: string;
  symbol: string | null;
  externalId: string | null;
  notificationId: string | null;
  signalId: string | null;
  fields: Record<string, unknown> | null;
}

const inputStyle: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
};

export default function LogsPage() {
  const [f, setF] = useState<Record<string, string>>({});
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v);
  const { data, isLoading } = useLive<LogRow[]>(qs.toString() ? `/api/logs?${qs}` : "/api/logs");
  const rows = data ?? [];

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Logs</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <select value={f.service ?? ""} onChange={(e) => setF({ ...f, service: e.target.value })} style={inputStyle}>
          <option value="">service: all</option>
          {["ingestion", "analysis", "evaluation"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={f.level ?? ""} onChange={(e) => setF({ ...f, level: e.target.value })} style={inputStyle}>
          <option value="">level: all</option>
          {["debug", "info", "warn", "error"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input placeholder="symbol" value={f.symbol ?? ""} onChange={(e) => setF({ ...f, symbol: e.target.value })} style={inputStyle} />
        <input placeholder="event contains…" value={f.event ?? ""} onChange={(e) => setF({ ...f, event: e.target.value })} style={inputStyle} />
        <input placeholder="search fields…" value={f.q ?? ""} onChange={(e) => setF({ ...f, q: e.target.value })} style={{ ...inputStyle, minWidth: 200 }} />
        <span style={{ alignSelf: "center", fontSize: 12, color: "var(--muted)" }}>
          {isLoading ? "loading…" : `${rows.length} lines · live 5s`}
        </span>
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12.5,
          overflow: "auto",
          maxHeight: "75vh",
        }}
      >
        {rows.length === 0 && <div style={{ padding: 16, color: "var(--muted)" }}>No log lines. Is LOG_DB=on for the services?</div>}
        {rows.map((r) => (
          <div
            key={r.id}
            style={{ display: "flex", gap: 10, padding: "5px 12px", borderBottom: "1px solid var(--border)", alignItems: "baseline" }}
          >
            <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtFull(r.ts)}</span>
            <span style={{ width: 50 }}>
              <StatusBadge status={r.level} />
            </span>
            <span style={{ color: "var(--muted)", width: 86 }}>[{r.service}]</span>
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.event}</span>
            {r.symbol && (
              <Link href={`/symbol/${r.symbol}`}>
                <Badge>{r.symbol}</Badge>
              </Link>
            )}
            <span style={{ color: "var(--muted)", wordBreak: "break-word" }}>
              {r.fields && Object.keys(r.fields).length > 0 ? JSON.stringify(r.fields) : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
