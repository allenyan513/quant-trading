"use client";

import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Badge, Card, Grid, JsonView, Meta, Stat, StatusBadge } from "@/components/ui";
import { fmtMoney, fmtNum, fmtPct, fmtFull } from "@/lib/format";

// Display names for the model_type ids (presentation only; mirrors the engine's
// model-names). The full ValuationSummary lives in the snapshot's `detail` jsonb.
const MODEL_NAMES: Record<string, string> = {
  dcf_fcff_growth_5y: "Growth Exit 5Y",
  dcf_fcff_growth_10y: "Growth Exit 10Y",
  dcf_fcff_ebitda_exit_5y: "EBITDA Exit 5Y",
  dcf_fcff_ebitda_exit_10y: "EBITDA Exit 10Y",
  revenue_dcf_5y: "Revenue DCF 5Y",
  revenue_dcf_10y: "Revenue DCF 10Y",
  pe_multiples: "P/E",
  ev_ebitda_multiples: "EV/EBITDA",
  ev_revenue_multiples: "EV/Revenue",
  peg: "PEG Fair Value",
  epv: "Earnings Power Value",
  ddm: "Dividend Discount",
};

// Pillar render order + label.
const PILLARS: [key: string, label: string][] = [
  ["dcf", "DCF Analysis"],
  ["tradingMultiples", "Trading Multiples"],
  ["peg", "PEG Fair Value"],
  ["epv", "Earnings Power Value"],
  ["ddm", "Dividend Discount"],
];

type Rec = Record<string, unknown>;
interface Model {
  model_type: string;
  fair_value: number;
  upside_percent: number;
  low_estimate: number;
  high_estimate: number;
  assumptions: Rec;
  details: Rec;
}
interface Pillar {
  fairValue: number;
  upside: number;
  models: Model[];
}
interface Summary {
  ticker?: string;
  company_name?: string;
  current_price?: number;
  primary_fair_value?: number;
  consensus_fair_value?: number;
  consensus_low?: number;
  consensus_high?: number;
  consensus_upside?: number;
  verdict?: string;
  verdict_text?: string;
  wacc?: Rec;
  pillars?: Record<string, Pillar>;
  models?: Model[];
  source?: string;
  error?: string;
}
interface Snapshot {
  snapshotId: string;
  symbol: string;
  asOf: string;
  fairValuePerShare: number | null;
  currentPrice: number | null;
  upsidePct: number | null;
  verdict: string | null;
  codeVersion: string;
  createdAt: string;
  detail: Summary;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Heuristic format for an assumption/detail scalar: fractions <1 as %, else number. */
function fmtScalar(v: unknown): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Math.abs(v) > 0 && Math.abs(v) < 1 ? `${(v * 100).toFixed(1)}%` : fmtNum(v);
  return "—";
}
/** Render an object's scalar fields as Meta rows (skips arrays/objects). */
function KvRows({ obj }: { obj: Rec }) {
  const rows = Object.entries(obj).filter(([, v]) => v === null || ["number", "string", "boolean"].includes(typeof v));
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {rows.map(([k, v]) => (
        <Meta key={k} label={k} value={fmtScalar(v)} />
      ))}
    </div>
  );
}

/** DCF per-year projection table (compact). */
function ProjectionsTable({ rows }: { rows: Rec[] }) {
  if (!rows?.length) return null;
  return (
    <table style={{ fontSize: 12, marginTop: 6 }}>
      <thead>
        <tr>
          {["Year", "Revenue", "FCFF", "PV(FCFF)"].map((h) => (
            <th key={h} style={thMini}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={tdMini}>{String(r.year ?? i + 1)}</td>
            <td style={tdMini}>{fmtMoney(num(r.revenue))}</td>
            <td style={tdMini}>{fmtMoney(num(r.fcff))}</td>
            <td style={tdMini}>{fmtMoney(num(r.pv_fcff))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Sensitivity matrix as a small heatmap (WACC rows × growth cols). */
function Sensitivity({ m }: { m: Rec }) {
  const rowsV = (m.discount_rate_values as number[]) ?? [];
  const colsV = (m.growth_values as number[]) ?? [];
  const prices = (m.prices as number[][]) ?? [];
  if (!prices.length) return null;
  const flat = prices.flat().filter((v) => typeof v === "number");
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const tint = (v: number) => {
    const t = max > min ? (v - min) / (max - min) : 0.5;
    return `rgba(63,185,80,${(t * 0.55).toFixed(2)})`; // greener = higher fair value
  };
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>sensitivity (WACC ↓ × terminal growth →)</div>
      <table style={{ fontSize: 11 }}>
        <thead>
          <tr>
            <th style={thMini}></th>
            {colsV.map((c, j) => (
              <th key={j} style={thMini}>{(c * 100).toFixed(1)}%</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {prices.map((row, i) => (
            <tr key={i}>
              <th style={thMini}>{rowsV[i] != null ? `${(rowsV[i]! * 100).toFixed(1)}%` : ""}</th>
              {row.map((v, j) => (
                <td key={j} style={{ ...tdMini, background: tint(v), textAlign: "right" }}>{fmtMoney(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Trading-multiples peer comparison table (compact). */
function PeerTable({ d }: { d: Rec }) {
  const peers = (d.peers as Rec[]) ?? [];
  if (!peers.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>
        peers · industry median {fmtNum(num(d.industry_median))} · {String(d.metric_label ?? "metric")} {fmtNum(num(d.company_metric))}
      </div>
      <table style={{ fontSize: 12 }}>
        <thead>
          <tr>{["Ticker", "Mkt cap", "P/E", "EV/EBITDA", "EV/Rev"].map((h) => <th key={h} style={thMini}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {peers.map((p, i) => (
            <tr key={i}>
              <td style={tdMini}>{String(p.ticker ?? "—")}</td>
              <td style={tdMini}>{fmtNum(num(p.market_cap), 0)}</td>
              <td style={tdMini}>{fmtNum(num(p.trailing_pe))}</td>
              <td style={tdMini}>{fmtNum(num(p.ev_ebitda))}</td>
              <td style={tdMini}>{fmtNum(num(p.ev_revenue))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelCard({ m }: { m: Model }) {
  const isDcf = Array.isArray(m.details?.projections);
  const isMultiples = Array.isArray(m.details?.peers);
  const up = num(m.upside_percent);
  return (
    <details style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
      <summary style={{ cursor: "pointer", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ minWidth: 150 }}>{MODEL_NAMES[m.model_type] ?? m.model_type}</strong>
        <span>fair {fmtMoney(num(m.fair_value))}</span>
        {up != null && <span style={{ color: up >= 0 ? "#3fb950" : "#f85149", fontWeight: 600 }}>{fmtPct(up)}</span>}
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          range {fmtMoney(num(m.low_estimate))} – {fmtMoney(num(m.high_estimate))}
        </span>
      </summary>
      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
        {m.assumptions && Object.keys(m.assumptions).length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>assumptions</div>
            <KvRows obj={m.assumptions} />
          </div>
        )}
        {isDcf && <ProjectionsTable rows={m.details.projections as Rec[]} />}
        {isDcf && !!m.details.sensitivity_matrix && <Sensitivity m={m.details.sensitivity_matrix as Rec} />}
        {isMultiples && <PeerTable d={m.details} />}
        {!isDcf && !isMultiples && m.details && Object.keys(m.details).length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>details</div>
            <KvRows obj={m.details} />
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--muted)" }}>raw</summary>
              <JsonView value={m.details} />
            </details>
          </div>
        )}
      </div>
    </details>
  );
}

export default function ValuationPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Snapshot | null>(`/api/data/valuation/${symbol}`);

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <a href={`/symbol/${symbol}`} style={{ fontSize: 13, color: "var(--muted)" }}>← {symbol} timeline</a>
      </div>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{symbol} · Valuation</h1>

      {error && <div style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</div>}
      {data === null && (
        <p style={{ color: "var(--muted)" }}>
          暂无估值快照。运行 alpha 的 <code>POST /internal/valuation-sweep</code>（或 watchlist 每日巡检）后再看。
        </p>
      )}
      {data && <Body snap={data} />}
    </div>
  );
}

function Body({ snap }: { snap: Snapshot }) {
  const s = snap.detail ?? {};
  if (s.source === "engine_error") {
    return <p style={{ color: "#f85149" }}>估值引擎报错：{s.error ?? "unknown"}（snapshot {snap.snapshotId}）</p>;
  }
  const wacc = s.wacc ?? {};
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Consensus hero */}
      <Grid min={150}>
        <Stat label="Consensus fair value" value={fmtMoney(num(s.consensus_fair_value))} />
        <Stat label="Current price" value={fmtMoney(num(s.current_price) ?? snap.currentPrice)} />
        <Stat
          label="Upside"
          value={fmtPct(num(s.consensus_upside) ?? snap.upsidePct)}
          color={(num(s.consensus_upside) ?? snap.upsidePct ?? 0) >= 0 ? "#3fb950" : "#f85149"}
        />
        <Stat label="Verdict" value={<StatusBadge status={s.verdict ?? snap.verdict} />} />
        <Stat label="Range" value={`${fmtMoney(num(s.consensus_low))} – ${fmtMoney(num(s.consensus_high))}`} />
      </Grid>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        as of {snap.asOf} · computed {fmtFull(snap.createdAt)} · {snap.codeVersion}
      </div>

      {/* WACC */}
      {Object.keys(wacc).length > 0 && (
        <Card title="WACC">
          <KvRows obj={wacc} />
        </Card>
      )}

      {/* Models grouped by pillar */}
      {PILLARS.map(([key, label]) => {
        const pillar = s.pillars?.[key];
        if (!pillar?.models?.length) return null;
        return (
          <Card key={key} title={`${label} · fair ${fmtMoney(num(pillar.fairValue))} (${fmtPct(num(pillar.upside))})`}>
            <div style={{ display: "grid", gap: 8 }}>
              {pillar.models.map((m) => (
                <ModelCard key={m.model_type} m={m} />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const thMini: React.CSSProperties = { textAlign: "left", padding: "2px 8px", color: "var(--muted)", fontWeight: 500, borderBottom: "1px solid var(--border)" };
const tdMini: React.CSSProperties = { padding: "2px 8px", borderBottom: "1px solid var(--border)" };
