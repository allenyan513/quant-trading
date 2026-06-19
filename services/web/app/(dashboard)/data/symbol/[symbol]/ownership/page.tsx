"use client";

/**
 * Ownership tab — the symbol-centric SEC ownership view: who has filed a >5% stake
 * (Schedule 13D activist / 13G passive) on this stock, plus which tracked 13F
 * legends hold it. Both come from one shared read (getOwnershipForSymbol), also fed
 * to the MCP get_symbol_research "ownership" section. SEC-only.
 */

import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Card, Badge, TimeText } from "@/components/ui";
import { fmtMoney, formatLargeNumber } from "@/lib/format";

interface Position {
  accessionNumber: string;
  filerName: string;
  filerLabel: string | null;
  schedule: string; // "13D" | "13G"
  formType: string;
  isAmendment: boolean;
  pctOfClass: number | null;
  sharesOwned: number | null;
  filedDate: string;
  amendmentCount: number;
  firstFiledDate: string;
}
interface Holder {
  cik: string;
  filerName: string;
  filerLabel: string | null;
  quarter: string;
  shares: number;
  value: number;
}
interface Ownership {
  symbol: string;
  filings: Position[];
  legendHolders: Holder[];
}

// 13D = activist (intent to influence) → attention color; 13G = passive → muted.
const SCHED_COLOR: Record<string, string> = { "13D": "#f0883e", "13G": "#8a97ab" };

export default function OwnershipTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Ownership>(`/api/data/symbol/${symbol}/ownership`);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  if (!data) return null;

  const empty = data.filings.length === 0 && data.legendHolders.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {empty && (
        <p style={{ color: "var(--muted)" }}>
          无 13D/13G 举牌申报，且追踪的 13F 投资人均未持有 {symbol}。
        </p>
      )}
      <Filings rows={data.filings} />
      <Holders rows={data.legendHolders} />
      <p style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>
        13D/13G = SEC 受益所有权披露（&gt;5% 才触发、约 10 天内申报）；仅覆盖追踪的维权方名单，
        非全市场。持股% / 股数取自申报封面，best-effort，常缺。13F 持有为季度快照（滞后约 45 天）。
      </p>
    </div>
  );
}

// ---------- 13D / 13G filings ----------
function Filings({ rows }: { rows: Position[] }) {
  if (rows.length === 0) return null;
  return (
    <Card title={`举牌 / 大股东申报 · 13D/13G (${rows.length})`}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r) => (
          <div
            key={r.accessionNumber}
            style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}
          >
            <span style={{ minWidth: 44 }}>
              <Badge color={SCHED_COLOR[r.schedule] ?? "#8a97ab"}>{r.schedule}</Badge>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {r.filerLabel ?? r.filerName}
              {r.amendmentCount > 1 && (
                <span style={{ color: "var(--muted)", fontSize: 11 }}> · 修订 ×{r.amendmentCount - 1}</span>
              )}
            </span>
            <span style={{ color: "var(--muted)", fontSize: 12, minWidth: 110, textAlign: "right" }}>
              {r.sharesOwned == null ? "" : `${formatLargeNumber(r.sharesOwned, { prefix: "", decimals: 0 })} 股`}
            </span>
            <span style={{ ...mono, fontWeight: 600, minWidth: 64, textAlign: "right" }}>
              {r.pctOfClass == null ? "—" : `${r.pctOfClass.toFixed(2)}%`}
            </span>
            <span style={{ color: "var(--muted)", fontSize: 12, minWidth: 92, textAlign: "right" }}>
              <TimeText ts={r.filedDate} />
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- 13F legend holders (reverse query) ----------
function Holders({ rows }: { rows: Holder[] }) {
  if (rows.length === 0) return null;
  return (
    <Card title={`传奇投资人持有 · 13F (${rows.length})`}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((h) => (
          <div
            key={h.cik}
            style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{h.filerLabel ?? h.filerName}</span>
            <span style={{ color: "var(--muted)", fontSize: 12, minWidth: 100, textAlign: "right" }}>
              {formatLargeNumber(h.shares, { prefix: "", decimals: 0 })} 股
            </span>
            <span style={{ ...mono, fontWeight: 600, minWidth: 80, textAlign: "right" }}>{fmtMoney(h.value)}</span>
            <span style={{ color: "var(--muted)", fontSize: 12, minWidth: 64, textAlign: "right" }}>{h.quarter.slice(0, 7)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace", textAlign: "right" };
