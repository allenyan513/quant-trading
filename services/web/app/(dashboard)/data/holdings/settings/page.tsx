"use client";

/**
 * Holdings · Settings — connect IBKR (set/update the Flex token + query id) and
 * trigger a sync. Submits to /api/holdings/credentials (forwarded to the data
 * service, owner of data_holdings_accounts; web stays read-only on the DB).
 * Saving auto-runs one sync; the "立即刷新" button re-syncs anytime. The current
 * token is never shown — only a masked tail from the status endpoint.
 */

import { useState } from "react";
import { useLive } from "@/components/live";
import { Card, Meta } from "@/components/ui";
import { fmtFull } from "@/lib/format";

interface Status {
  accountId: string;
  connected: boolean;
  flexQueryId: string | null;
  tokenMask: string | null;
  updatedAt: string | null;
}

interface SyncResult {
  navRowsUpserted: number;
  tradesInserted: number;
  positionsUpserted: number;
  spyRows: number;
}

const inputStyle: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
};

const btnStyle = (disabled: boolean, primary = true): React.CSSProperties => ({
  background: primary ? "#58a6ff" : "var(--panel-2)",
  border: primary ? "none" : "1px solid var(--border)",
  color: primary ? "#0b0e14" : "var(--text)",
  fontWeight: 700,
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 13,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.5 : 1,
});

export default function HoldingsSettingsPage() {
  const { data: status, mutate } = useLive<Status>("/api/holdings/credentials");
  const [token, setToken] = useState("");
  const [queryId, setQueryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /** Trigger a holdings sync (Flex pull → DB). Slow (~10–30s of IBKR polling). */
  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/holdings/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const r = json.data as SyncResult;
      setSyncMsg({
        ok: true,
        text: `同步完成：NAV ${r.navRowsUpserted} 行 · 成交 +${r.tradesInserted} · 持仓 ${r.positionsUpserted} · SPY ${r.spyRows}`,
      });
      mutate();
    } catch (e) {
      setSyncMsg({ ok: false, text: `同步失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSyncing(false);
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/holdings/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, queryId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMsg({ ok: true, text: "凭证已保存，正在自动同步…" });
      setToken("");
      setQueryId("");
      mutate();
      // Auto-run one sync right after connecting (covers the first-time case).
      void sync();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const saveDisabled = busy || !token.trim() || !queryId.trim();

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <Card title="当前连接">
        {status?.connected ? (
          <div style={{ display: "grid", gap: 8 }}>
            <Meta label="account" value={status.accountId} />
            <Meta label="query id" value={status.flexQueryId ?? "—"} />
            <Meta label="token" value={status.tokenMask ?? "—"} />
            <Meta label="updated" value={status.updatedAt ? fmtFull(status.updatedAt) : "—"} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
              <button onClick={sync} disabled={syncing} style={btnStyle(syncing, false)}>
                {syncing ? "同步中…" : "立即刷新"}
              </button>
              {syncMsg && <span style={{ fontSize: 13, color: syncMsg.ok ? "#3fb950" : "#f85149" }}>{syncMsg.text}</span>}
            </div>
          </div>
        ) : (
          <p style={{ color: "var(--muted)", margin: 0 }}>尚未连接。填入下方表单保存凭证（保存后会自动同步一次）。</p>
        )}
      </Card>

      <Card title={status?.connected ? "更新凭证" : "连接 IBKR"}>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
            Flex token
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Account Management → Reports → Flex Web Service"
              style={inputStyle}
              autoComplete="off"
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
            Flex query id
            <input
              value={queryId}
              onChange={(e) => setQueryId(e.target.value)}
              placeholder="须含 Trades + Open Positions + Change in NAV"
              style={inputStyle}
              autoComplete="off"
            />
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={save} disabled={saveDisabled} style={btnStyle(saveDisabled)}>
              {busy ? "保存中…" : "保存并同步"}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.ok ? "#3fb950" : "#f85149" }}>{msg.text}</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
