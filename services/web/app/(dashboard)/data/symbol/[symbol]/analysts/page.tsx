"use client";

/**
 * Analysts tab — surfaces the record caches warmSymbol already fills but nothing
 * displayed before: forward analyst estimates, grade changes, price targets, and
 * insider (Form-4) trades. All read from raw FMP `data` jsonb, defensively.
 */

import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Card, Badge, TimeText } from "@/components/ui";
import { fmtMoney, fmtNum, formatLargeNumber } from "@/lib/format";

type Rec = Record<string, unknown>;
interface Dated {
  observedAt: string;
  data: Rec;
}
interface EstRow {
  fiscalDate: string;
  data: Rec;
}
interface Analysts {
  symbol: string;
  ratings: Dated[];
  priceTargets: Dated[];
  insider: Dated[];
  estimates: EstRow[];
}

const n = (d: Rec, k: string): number | null => {
  const v = d[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
const s = (d: Rec, k: string): string | null => {
  const v = d[k];
  return typeof v === "string" && v ? v : null;
};

export default function AnalystsTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Analysts>(`/api/data/symbol/${symbol}/analysts`);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  if (!data) return null;

  const empty =
    data.estimates.length === 0 && data.ratings.length === 0 && data.priceTargets.length === 0 && data.insider.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {empty && (
        <p style={{ color: "var(--muted)" }}>暂无分析师/内部人数据（点头部「⟳ 刷新数据」预热该 symbol）。</p>
      )}
      <Estimates rows={data.estimates} />
      <PriceTargets rows={data.priceTargets} />
      <Ratings rows={data.ratings} />
      <Insider rows={data.insider} />
    </div>
  );
}

// ---------- forward estimates ----------
function Estimates({ rows }: { rows: EstRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card title="分析师预期 · 营收 / EPS 一致预期">
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              {["财年", "营收(avg)", "EPS(avg)", "营收区间", "EPS 区间", "#分析师"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = r.data;
              const an = n(d, "numAnalystsRevenue") ?? n(d, "numAnalystsEps") ?? n(d, "numAnalysts");
              const eps = n(d, "epsAvg");
              const epsL = n(d, "epsLow");
              const epsH = n(d, "epsHigh");
              return (
                <tr key={r.fiscalDate}>
                  <td style={{ ...td, textAlign: "left" }}>{r.fiscalDate.slice(0, 4)}</td>
                  <td style={{ ...td, ...mono }}>{n(d, "revenueAvg") == null ? "—" : formatLargeNumber(n(d, "revenueAvg")!)}</td>
                  <td style={{ ...td, ...mono }}>{eps == null ? "—" : `$${eps.toFixed(2)}`}</td>
                  <td style={{ ...td, ...mono, color: "var(--muted)" }}>
                    {n(d, "revenueLow") == null ? "—" : `${formatLargeNumber(n(d, "revenueLow")!)}–${formatLargeNumber(n(d, "revenueHigh") ?? n(d, "revenueLow")!)}`}
                  </td>
                  <td style={{ ...td, ...mono, color: "var(--muted)" }}>{epsL == null ? "—" : `$${epsL.toFixed(2)}–$${(epsH ?? epsL).toFixed(2)}`}</td>
                  <td style={{ ...td, ...mono, color: "var(--muted)" }}>{an == null ? "—" : fmtNum(an, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- price targets ----------
function PriceTargets({ rows }: { rows: Dated[] }) {
  if (rows.length === 0) return null;
  const targets = rows.map((r) => n(r.data, "adjPriceTarget") ?? n(r.data, "priceTarget")).filter((v): v is number => v != null);
  const avg = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : null;
  return (
    <Card title={`目标价${avg != null ? ` · 近 ${targets.length} 条均值 ${fmtMoney(avg)}` : ""}`}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.slice(0, 12).map((r, i) => {
          const d = r.data;
          const tgt = n(d, "adjPriceTarget") ?? n(d, "priceTarget");
          const when = n(d, "priceWhenPosted");
          const up = tgt != null && when != null && when !== 0 ? (tgt - when) / when : null;
          return (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ color: "var(--muted)", minWidth: 92, fontSize: 12 }}>
                <TimeText ts={s(d, "publishedDate") ?? r.observedAt} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{s(d, "analystCompany") ?? s(d, "analystName") ?? "—"}</span>
              <span style={{ ...mono, fontWeight: 600 }}>{fmtMoney(tgt)}</span>
              {up != null && (
                <span style={{ ...mono, fontSize: 12, color: up >= 0 ? "#3fb950" : "#f85149", minWidth: 56, textAlign: "right" }}>
                  {up >= 0 ? "+" : ""}{(up * 100).toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- grade changes ----------
const ACTION_COLOR: Record<string, string> = {
  upgrade: "#3fb950",
  downgrade: "#f85149",
  initiate: "#58a6ff",
  maintain: "#8a97ab",
};
function Ratings({ rows }: { rows: Dated[] }) {
  if (rows.length === 0) return null;
  return (
    <Card title="评级变动">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.slice(0, 15).map((r, i) => {
          const d = r.data;
          const action = (s(d, "action") ?? "").toLowerCase();
          const prev = s(d, "previousGrade");
          const next = s(d, "newGrade");
          return (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ color: "var(--muted)", minWidth: 92, fontSize: 12 }}>
                <TimeText ts={s(d, "date") ?? r.observedAt} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{s(d, "gradingCompany") ?? "—"}</span>
              <span style={{ color: "var(--muted)" }}>
                {prev ? `${prev} → ` : ""}
                <span style={{ color: "var(--text)" }}>{next ?? "—"}</span>
              </span>
              {action && <Badge color={ACTION_COLOR[action] ?? "#8a97ab"}>{action}</Badge>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- insider trades ----------
function Insider({ rows }: { rows: Dated[] }) {
  if (rows.length === 0) return null;
  return (
    <Card title="内部人交易 (Form 4)">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.slice(0, 20).map((r, i) => {
          const d = r.data;
          const tx = s(d, "transactionType") ?? "";
          const isBuy = /^p/i.test(tx) || /purchase/i.test(tx);
          const isSell = /^s/i.test(tx) || /sale/i.test(tx);
          const shares = n(d, "securitiesTransacted");
          const price = n(d, "price");
          const value = shares != null && price != null ? shares * price : null;
          const color = isBuy ? "#3fb950" : isSell ? "#f85149" : "#8a97ab";
          return (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ color: "var(--muted)", minWidth: 92, fontSize: 12 }}>
                <TimeText ts={s(d, "transactionDate") ?? s(d, "filingDate") ?? r.observedAt} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {s(d, "reportingName") ?? "—"}
                {s(d, "typeOfOwner") && <span style={{ color: "var(--muted)", fontSize: 11 }}> · {s(d, "typeOfOwner")}</span>}
              </span>
              <Badge color={color}>{isBuy ? "buy" : isSell ? "sell" : tx || "—"}</Badge>
              <span style={{ ...mono, fontSize: 12, color: "var(--muted)", minWidth: 70, textAlign: "right" }}>{shares == null ? "—" : formatLargeNumber(shares, { prefix: "", decimals: 0 })}</span>
              <span style={{ ...mono, minWidth: 72, textAlign: "right" }}>{value == null ? "—" : formatLargeNumber(value)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const th: React.CSSProperties = { fontSize: 11, color: "var(--muted)", padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace", textAlign: "right" };
