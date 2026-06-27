"use client";

/**
 * Ownership tab — the symbol-centric SEC ownership view: who has filed a >5% stake
 * (Schedule 13D activist / 13G passive) on this stock, plus which tracked 13F
 * legends hold it. Both come from one shared read (getOwnershipForSymbol), also fed
 * to the MCP get_symbol_research "ownership" section. SEC-only.
 */

import { useParams } from "@/lib/next-navigation";
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

interface InsiderTxn {
  reportingName: string;
  relationship: string | null;
  officerTitle: string | null;
  code: string | null;
  codeLabel: string | null;
  signal: "buy" | "sell" | "neutral";
  shares: number | null;
  price: number | null;
  value: number | null;
  is10b5_1: boolean;
  date: string | null;
}
interface Insiders {
  symbol: string;
  source: "sec" | "none";
  insiders: InsiderTxn[];
}

// 13D = activist (intent to influence) → attention color; 13G = passive → muted.
const SCHED_COLOR: Record<string, string> = { "13D": "#f0883e", "13G": "#8a97ab" };
// Insider transaction signal: open-market buy/sell are the strong ones.
const SIGNAL_COLOR: Record<string, string> = { buy: "#3fb950", sell: "#f85149", neutral: "#8a97ab" };

export default function OwnershipTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params?.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Ownership>(`/api/data/symbol/${symbol}/ownership`);
  const insidersRes = useLive<Insiders>(`/api/data/symbol/${symbol}/insiders`);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  if (!data) return null;

  const ins = insidersRes.data;
  // Only conclude "empty" once insiders have actually loaded (ins !== undefined),
  // else the empty notice flashes before the insider fetch resolves.
  const empty = data.filings.length === 0 && data.legendHolders.length === 0 && ins !== undefined && ins.insiders.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {empty && (
        <p style={{ color: "var(--muted)" }}>No 13D/13G filings, no 13F investors holding {symbol}, and no insider trades in the past year.</p>
      )}
      <Filings rows={data.filings} />
      <Holders rows={data.legendHolders} />
      {ins && <Insiders data={ins} />}
      <p style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>
        13D/13G = SEC beneficial-ownership disclosures (triggered only above &gt;5%); 13F is a quarterly snapshot (~45-day lag).
        Insider trades = SEC Form 4 (direct, with transaction code and 10b5-1):
        <span style={{ color: SIGNAL_COLOR.buy }}>P buy</span> /
        <span style={{ color: SIGNAL_COLOR.sell }}> S sell</span> are strong open-market signals,
        the rest (M exercise / F tax / A grant / G gift) are routine.
      </p>
    </div>
  );
}

// ---------- 13D / 13G filings ----------
function Filings({ rows }: { rows: Position[] }) {
  if (rows.length === 0) return null;
  return (
    <Card title={`Ownership filings · 13D/13G (${rows.length})`}>
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
                <span style={{ color: "var(--muted)", fontSize: 11 }}> · amended ×{r.amendmentCount - 1}</span>
              )}
            </span>
            <span style={{ color: "var(--muted)", fontSize: 12, minWidth: 110, textAlign: "right" }}>
              {r.sharesOwned == null ? "" : `${formatLargeNumber(r.sharesOwned, { prefix: "", decimals: 0 })} sh`}
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
    <Card title={`Legend investors holding · 13F (${rows.length})`}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((h) => (
          <div
            key={h.cik}
            style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{h.filerLabel ?? h.filerName}</span>
            <span style={{ color: "var(--muted)", fontSize: 12, minWidth: 100, textAlign: "right" }}>
              {formatLargeNumber(h.shares, { prefix: "", decimals: 0 })} sh
            </span>
            <span style={{ ...mono, fontWeight: 600, minWidth: 80, textAlign: "right" }}>{fmtMoney(h.value)}</span>
            <span style={{ color: "var(--muted)", fontSize: 12, minWidth: 64, textAlign: "right" }}>{h.quarter.slice(0, 7)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- insider transactions (SEC Form 4) ----------
function Insiders({ data }: { data: Insiders }) {
  if (data.insiders.length === 0) return null;
  return (
    <Card title={`Insider trades · Form 4 (${data.insiders.length})`}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {data.insiders.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
            <span style={{ color: "var(--muted)", fontSize: 12, minWidth: 92 }}>
              <TimeText ts={t.date} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {t.reportingName}
              {(t.officerTitle || t.relationship) && (
                <span style={{ color: "var(--muted)", fontSize: 11 }}> · {t.officerTitle ?? t.relationship}</span>
              )}
            </span>
            {t.is10b5_1 && <Badge color="#8a97ab">10b5-1</Badge>}
            {t.code && (
              <span style={{ minWidth: 46 }} title={t.codeLabel ?? undefined}>
                <Badge color={SIGNAL_COLOR[t.signal]}>{t.signal === "buy" ? "buy" : t.signal === "sell" ? "sell" : t.code}</Badge>
              </span>
            )}
            <span style={{ ...mono, fontSize: 12, color: "var(--muted)", minWidth: 68, textAlign: "right" }}>
              {t.shares == null ? "—" : formatLargeNumber(t.shares, { prefix: "", decimals: 0 })}
            </span>
            <span style={{ ...mono, minWidth: 72, textAlign: "right" }}>
              {t.value != null ? formatLargeNumber(t.value) : t.price != null ? fmtMoney(t.price) : "—"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace", textAlign: "right" };
