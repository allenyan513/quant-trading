"use client";

/**
 * Research price chart on lightweight-charts (TradingView). Panes, top→bottom:
 *   1) price — candles + volume + MA50/MA200 + fair-value/buy-zone/cost overlays,
 *   2) RSI(14),
 *   3) events lane — earnings/8-K/insider/dividend markers, time-aligned but OFF
 *      the candles so they don't clutter the price.
 * Plus a log-scale toggle and a crosshair OHLC readout.
 *
 * Receives the FULL bar history + a `rangeDays` window; indicators are computed on
 * the full series and the chart just zooms to the window (so MA50/MA200 have no
 * warm-up gap at the window's start). Overlay lines are autoscale-neutral so a
 * far-away fair value can't squash the candles. ONLY module importing the lib —
 * reach via price-chart.lazy.tsx (ssr:false). Canvas colors are hardcoded hexes.
 */

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  ColorType,
  PriceScaleMode,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

export interface Bar {
  time: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}
export interface FvPoint {
  time: string;
  value: number;
}
export interface Band {
  fair: number | null;
  low: number | null;
  high: number | null;
}
export type MarkerKind = "earnings" | "event" | "insider_buy" | "insider_sell" | "dividend";
export interface ChartMarker {
  time: string;
  kind: MarkerKind;
  label: string;
}

const UP = "#3fb950";
const DOWN = "#f85149";
const MUTED = "#8a97ab";
const BORDER = "#232c3d";
const FV = "#79c0ff";
const MA50_C = "#d29922";
const MA200_C = "#a371f7";
const RSI_C = "#58a6ff";
const COST_C = "#e3b341";
const NEUTRAL = () => null; // autoscaleInfoProvider → an overlay never expands the candle scale

const isBar = (b: Bar): b is Bar & { open: number; high: number; low: number; close: number } =>
  b.open != null && b.high != null && b.low != null && b.close != null;

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + (ch > 0 ? ch : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (ch < 0 ? -ch : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

const MARKER_STYLE: Record<MarkerKind, { position: "aboveBar" | "belowBar" | "inBar"; shape: "circle" | "square" | "arrowUp" | "arrowDown"; color: string }> = {
  earnings: { position: "inBar", shape: "circle", color: "#58a6ff" },
  event: { position: "inBar", shape: "square", color: "#d29922" },
  insider_buy: { position: "inBar", shape: "arrowUp", color: UP },
  insider_sell: { position: "inBar", shape: "arrowDown", color: DOWN },
  dividend: { position: "inBar", shape: "circle", color: MUTED },
};

export function PriceChart({
  bars,
  rangeDays = null,
  fairValue,
  fvHistory = [],
  band = null,
  costBasis = null,
  markers = [],
  log = false,
  showMA50 = true,
  showMA200 = true,
  showRSI = true,
}: {
  bars: Bar[];
  rangeDays?: number | null;
  fairValue: number | null;
  fvHistory?: FvPoint[];
  band?: Band | null;
  costBasis?: number | null;
  markers?: ChartMarker[];
  log?: boolean;
  showMA50?: boolean;
  showMA200?: boolean;
  showRSI?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ma200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const fvRef = useRef<ISeriesApi<"Line"> | null>(null);
  const lowRef = useRef<ISeriesApi<"Line"> | null>(null);
  const highRef = useRef<ISeriesApi<"Line"> | null>(null);
  const costRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const evRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 600,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: MUTED, fontSize: 11 },
      grid: { vertLines: { color: BORDER }, horzLines: { color: BORDER } },
      rightPriceScale: { borderColor: BORDER },
      timeScale: { borderColor: BORDER, timeVisible: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    // Pane 0 — price.
    const candle = chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN }, 0);
    candleRef.current = candle;
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" }, 0);
    volRef.current = vol;
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    const overlayLine = (color: string, dashed = true) =>
      chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, autoscaleInfoProvider: NEUTRAL }, 0);
    ma50Ref.current = overlayLine(MA50_C, false);
    ma200Ref.current = overlayLine(MA200_C, false);
    fvRef.current = overlayLine(FV);
    lowRef.current = overlayLine(UP);
    highRef.current = overlayLine("#6e7681");
    costRef.current = overlayLine(COST_C, false);

    // Pane 1 — RSI.
    const rsiPane = chart.addPane();
    // Fixed 0–100 scale: correct for RSI, and lets the pane size even when the
    // series is empty (toggled off) — avoids the null-autoscale crash.
    const rs = rsiPane.addSeries(LineSeries, {
      color: RSI_C,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    rs.createPriceLine({ price: 70, color: BORDER, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    rs.createPriceLine({ price: 30, color: BORDER, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    rsiRef.current = rs;

    // Pane 2 — events lane (a flat hidden series carries the markers, time-aligned).
    // Its scale needs a REAL fixed range: a pane whose only series returns null
    // autoscale can't size itself (lightweight-charts ensureNotNull crash).
    const evPane = chart.addPane();
    const ev = evPane.addSeries(LineSeries, {
      color: "transparent",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: -1, maxValue: 1 } }),
    });
    ev.priceScale().applyOptions({ visible: false });
    evRef.current = ev;
    markersRef.current = createSeriesMarkers(ev, []);

    chart.panes()[0]?.setStretchFactor(6);
    chart.panes()[1]?.setStretchFactor(1.6);
    chart.panes()[2]?.setStretchFactor(0.9);

    chart.subscribeCrosshairMove((param) => {
      const node = legendRef.current;
      if (!node) return;
      const d = param.time ? (param.seriesData.get(candle) as { open?: number; high?: number; low?: number; close?: number } | undefined) : undefined;
      if (!d || d.open == null) return void (node.textContent = "");
      const f = (n?: number) => (n == null ? "—" : n.toFixed(2));
      node.textContent = `O ${f(d.open)}  H ${f(d.high)}  L ${f(d.low)}  C ${f(d.close)}`;
    });

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) chart.applyOptions({ width: w });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = candleRef.current = volRef.current = ma50Ref.current = ma200Ref.current = null;
      fvRef.current = lowRef.current = highRef.current = costRef.current = rsiRef.current = evRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle || !volRef.current || !ma50Ref.current || !ma200Ref.current || !fvRef.current || !lowRef.current || !highRef.current || !costRef.current || !rsiRef.current || !evRef.current) return;

    const valid = bars.filter(isBar);
    if (valid.length === 0) return;
    const first = valid[0]!.time;
    const last = valid.at(-1)!.time;
    candle.setData(valid.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    volRef.current.setData(valid.map((b) => ({ time: b.time, value: b.volume ?? 0, color: b.close >= b.open ? "rgba(63,185,80,0.35)" : "rgba(248,81,73,0.35)" })));

    // Indicators on the FULL series (no warm-up gap inside the visible window).
    const closes = valid.map((b) => b.close);
    const lineFrom = (sx: (number | null)[], series: ISeriesApi<"Line">, on: boolean) =>
      series.setData(on ? valid.map((b, i) => ({ time: b.time, value: sx[i] })).filter((p): p is { time: string; value: number } => p.value != null) : []);
    lineFrom(sma(closes, 50), ma50Ref.current, showMA50);
    lineFrom(sma(closes, 200), ma200Ref.current, showMA200);
    lineFrom(rsi(closes, 14), rsiRef.current, showRSI);

    // Overlay reference lines as flat 2-point series (autoscale-neutral → never squashes candles).
    const flat = (v: number | null | undefined, series: ISeriesApi<"Line">) =>
      series.setData(v != null && Number.isFinite(v) ? [{ time: first as Time, value: v }, { time: last as Time, value: v }] : []);
    const fvPts = fvHistory.filter((p) => p.time >= first && Number.isFinite(p.value));
    if (fvPts.length >= 2) fvRef.current.setData(fvPts.map((p) => ({ time: p.time, value: p.value })));
    else flat(fairValue, fvRef.current);
    flat(band?.low, lowRef.current);
    flat(band?.high, highRef.current);
    flat(costBasis, costRef.current);

    // Events lane: flat carrier + markers (page already filtered markers by type).
    evRef.current.setData(valid.map((b) => ({ time: b.time, value: 0 })));
    const sm: SeriesMarker<Time>[] = markers
      .filter((m) => m.time >= first && m.time <= last)
      .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
      .map((m) => {
        const s = MARKER_STYLE[m.kind];
        return { time: m.time as Time, position: s.position, shape: s.shape, color: s.color, text: m.label };
      });
    markersRef.current?.setMarkers(sm);

    chart.priceScale("right").applyOptions({ mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });

    // Zoom to the requested window (indicators already span the full history).
    if (rangeDays != null && valid.length > rangeDays) {
      chart.timeScale().setVisibleRange({ from: valid[valid.length - rangeDays]!.time as Time, to: last as Time });
    } else {
      chart.timeScale().fitContent();
    }
  }, [bars, rangeDays, fairValue, fvHistory, band, costBasis, markers, log, showMA50, showMA200, showRSI]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={legendRef} style={{ position: "absolute", top: 6, left: 8, zIndex: 2, fontSize: 11, color: MUTED, fontVariantNumeric: "tabular-nums", pointerEvents: "none" }} />
      <div ref={ref} style={{ width: "100%", height: 600 }} />
    </div>
  );
}
