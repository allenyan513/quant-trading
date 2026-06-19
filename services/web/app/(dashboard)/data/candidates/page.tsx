"use client";

import { useState } from "react";
import { mutate } from "swr";
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge, JsonView, Meta, StatusBadge, TimeText } from "@/components/ui";
import { fmtFull } from "@/lib/format";

/** Dismiss button. Calls the web route (which forwards to the data service), then
 *  revalidates the candidates table. Promote-into-watchlist is SEVERED — the
 *  watchlist is per-user now, so candidates are a read-only discovery view (see the
 *  follow-up issue). Only Dismiss (noise removal) remains. */
function CandidateActions({ symbol, status }: { symbol: string; status: string }) {
  const [busy, setBusy] = useState(false);
  if (status !== "pending") return <span style={{ color: "var(--muted)" }}>—</span>;

  async function dismiss() {
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/dismiss`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`dismiss failed: ${j.error ?? res.status}`);
        return;
      }
      await mutate((k) => typeof k === "string" && k.startsWith("/api/candidates"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        disabled={busy}
        onClick={dismiss}
        style={{
          fontSize: 12,
          padding: "2px 8px",
          borderRadius: 4,
          cursor: busy ? "default" : "pointer",
          border: "1px solid #f85149",
          background: "transparent",
          color: "#f85149",
          opacity: busy ? 0.5 : 1,
        }}
      >
        Dismiss
      </button>
    </span>
  );
}

interface CandidateRow {
  symbol: string;
  source: string;
  discoveryReason: string | null;
  score: number | null;
  detail: unknown;
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** On-demand trigger for the XBRL Frames fundamental screener (#106). Forwards to
 *  the data service (which owns /scan/*), then revalidates the candidates table.
 *  The scan pulls a few SEC frames + ranks market-wide, so it takes a few seconds. */
function RunScreenerButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/scan/fundamentals`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { period?: string; candidates?: number }; error?: string };
      if (!res.ok || !j.ok) {
        setMsg(`扫描失败：${j.error ?? res.status}`);
        return;
      }
      setMsg(`✓ ${j.data?.period ?? ""} 扫出 ${j.data?.candidates ?? 0} 个候选`);
      await mutate((k) => typeof k === "string" && k.startsWith("/api/candidates"));
    } catch (err) {
      setMsg(`扫描失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <button
        disabled={busy}
        onClick={run}
        style={{
          fontSize: 13,
          padding: "5px 12px",
          borderRadius: 4,
          cursor: busy ? "default" : "pointer",
          border: "1px solid #2f81f7",
          background: "transparent",
          color: "#2f81f7",
          opacity: busy ? 0.5 : 1,
        }}
      >
        {busy ? "扫描中…（拉 SEC frames，约几秒）" : "运行基本面筛股（营收同比增速）"}
      </button>
      {msg && <span style={{ fontSize: 12, color: "var(--muted)" }}>{msg}</span>}
    </span>
  );
}

const columns: Column<CandidateRow>[] = [
  { key: "lastSeenAt", header: "Last seen", render: (r) => <TimeText ts={r.lastSeenAt} />, width: 128 },
  { key: "symbol", header: "Symbol", render: (r) => <Badge>{r.symbol}</Badge> },
  { key: "source", header: "Source", render: (r) => <Badge>{r.source}</Badge> },
  { key: "score", header: "Score", render: (r) => (r.score == null ? "—" : r.score.toFixed(3)) },
  { key: "discoveryReason", header: "Reason", render: (r) => <span style={{ fontSize: 13 }}>{r.discoveryReason ?? "—"}</span> },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  { key: "actions", header: "Actions", render: (r) => <CandidateActions symbol={r.symbol} status={r.status} /> },
];

export default function CandidatesPage() {
  return (
    <div>
      <PageTitle subsystem="data" sub="选股发现 scanner（只读发现队列）">Candidates</PageTitle>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Discovery review queue. 升级进 watchlist 已暂停（watchlist 现为每用户私有，见 follow-up issue）；
        当前仅支持 Dismiss 噪音。
      </p>
      <RunScreenerButton />
      <LiveTable
        path="/api/candidates"
        rowKey={(r) => r.symbol}
        columns={columns}
        pageSize={50}
        emptyText="暂无候选 —— 点上方「运行基本面筛股」，或跑 POST /scan/earnings。"
        filters={[
          {
            key: "status",
            label: "Status",
            options: ["pending", "promoted", "dismissed"].map((v) => ({ value: v, label: v })),
          },
        ]}
        expand={(r) => (
          <div style={{ display: "grid", gap: 10 }}>
            <Meta label="symbol" value={r.symbol} />
            <Meta label="reason" value={r.discoveryReason ?? "—"} />
            <Meta label="first_seen" value={fmtFull(r.firstSeenAt)} />
            <Meta label="last_seen" value={fmtFull(r.lastSeenAt)} />
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>scan detail</div>
              <JsonView value={r.detail} />
            </div>
          </div>
        )}
      />
    </div>
  );
}
