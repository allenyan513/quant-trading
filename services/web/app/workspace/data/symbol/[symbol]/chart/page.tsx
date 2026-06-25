"use client";

/**
 * Chart tab — research-grade price chart: candles + volume + fair-value/buy-zone,
 * MA50/MA200, an RSI pane, your cost-basis line, and event markers (earnings /
 * 8-K / insider / dividend) from our facts layer. Fetches the price window once
 * and slices client-side by range. The chart itself loads via PriceChartLazy
 * (ssr:false) so lightweight-charts never hits the server.
 */

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Card } from "@/components/ui";
import { PriceChartLazy, type Bar, type Band, type ChartMarker, type MarkerKind } from "@/components/price-chart.lazy";
import { fmtMoney, fmtFull } from "@/lib/format";

interface Prices {
  symbol: string;
  bars: Bar[];
  fairValue: number | null;
  asOf: string | null;
  fvHistory: { time: string; value: number }[];
  band: Band | null;
}
interface Position {
  symbol: string;
  assetClass: string;
  avgPrice: number | null;
}

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "6M", label: "6M", days: 126 },
  { key: "1Y", label: "1Y", days: 252 },
  { key: "5Y", label: "5Y", days: 1260 },
  { key: "10Y", label: "10Y", days: 2520 },
  { key: "Max", label: "Max", days: null },
];

const MARKER_TYPES: { key: MarkerKind; label: string }[] = [
  { key: "earnings", label: "Earnings" },
  { key: "event", label: "8-K" },
  { key: "insider_buy", label: "Insider buy" },
  { key: "insider_sell", label: "Insider sell" },
  { key: "dividend", label: "Dividend" },
];

export default function ChartTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const [range, setRange] = useState("1Y");
  const [log, setLog] = useState(false);
  const [showMA50, setMA50] = useState(true);
  const [showMA200, setMA200] = useState(true);
  const [showRSI, setRSI] = useState(true);
  const [hidden, setHidden] = useState<Set<MarkerKind>>(() => new Set());

  const { data, error } = useLive<Prices>(`/api/data/symbol/${symbol}/prices?days=2600`);
  const { data: overlays } = useLive<{ markers: ChartMarker[] }>(`/api/data/symbol/${symbol}/overlays`);
  const { data: holdings } = useLive<{ positions: Position[] }>(`/api/holdings/positions`);

  const bars = useMemo(() => {
    const all = data?.bars ?? [];
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    return days == null ? all : all.slice(-days);
  }, [data, range]);
  const markers = useMemo(() => (overlays?.markers ?? []).filter((m) => !hidden.has(m.kind)), [overlays, hidden]);
  const costBasis = useMemo(
    () => holdings?.positions.find((p) => p.symbol === symbol && p.assetClass !== "OPT")?.avgPrice ?? null,
    [holdings, symbol],
  );

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  if (!data || data.bars.length === 0) return <p style={{ color: "var(--muted)" }}>No price data yet (daily bars for this symbol not warmed).</p>;

  const toggleMarker = (k: MarkerKind) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <Card
      title={
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span>Price</span>
          <span style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ display: "flex", gap: 4 }}>
              {RANGES.map((r) => (
                <button key={r.key} onClick={() => setRange(r.key)} style={pill(range === r.key)}>{r.label}</button>
              ))}
            </span>
            <button onClick={() => setLog((v) => !v)} style={pill(log)} title="Logarithmic price scale">log</button>
            <span style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setMA50((v) => !v)} style={pill(showMA50, "#d29922")}>MA50</button>
              <button onClick={() => setMA200((v) => !v)} style={pill(showMA200, "#a371f7")}>MA200</button>
              <button onClick={() => setRSI((v) => !v)} style={pill(showRSI)}>RSI</button>
            </span>
          </span>
        </span>
      }
    >
      <PriceChartLazy
        bars={bars}
        fairValue={data.fairValue}
        fvHistory={data.fvHistory}
        band={data.band}
        costBasis={costBasis}
        markers={markers}
        log={log}
        showMA50={showMA50}
        showMA200={showMA200}
        showRSI={showRSI}
      />

      {/* Marker legend + per-type toggles */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {MARKER_TYPES.map((m) => (
          <button key={m.key} onClick={() => toggleMarker(m.key)} style={pill(!hidden.has(m.key))}>{m.label}</button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
        {data.fairValue != null && (
          <span>
            <span style={{ color: "#79c0ff" }}>— —</span> Fair value {fmtMoney(data.fairValue)}
            {data.asOf && <span> · valued {fmtFull(data.asOf)}</span>}
          </span>
        )}
        {data.band?.low != null && data.band?.high != null && (
          <span>Buy zone {fmtMoney(data.band.low)} – {fmtMoney(data.band.high)}</span>
        )}
        {costBasis != null && <span style={{ color: "#e3b341" }}>— Cost {fmtMoney(costBasis)}</span>}
      </div>
    </Card>
  );
}

function pill(on: boolean, onColor?: string): React.CSSProperties {
  return {
    background: on ? "var(--panel-2)" : "transparent",
    border: "1px solid var(--border)",
    color: on ? (onColor ?? "var(--text)") : "var(--muted)",
    borderRadius: 6,
    padding: "2px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}
