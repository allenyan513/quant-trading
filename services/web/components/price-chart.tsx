"use client";

/**
 * Candlestick + volume price chart with a fair-value overlay line, built on
 * lightweight-charts (TradingView). This is the ONLY module importing the lib —
 * it must be reached exclusively through price-chart.lazy.tsx (ssr:false), since
 * lightweight-charts touches window/DOM and would crash SSR / the standalone
 * build otherwise. Pure render: data is fetched by the page and passed in.
 *
 * Theme colors are hardcoded hexes (matching the app palette) because CSS
 * variables don't resolve inside the chart's canvas.
 */

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
} from "lightweight-charts";

export interface Bar {
  time: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

const UP = "#3fb950";
const DOWN = "#f85149";
const MUTED = "#8a97ab";
const BORDER = "#232c3d";
const FV = "#a371f7";

const isBar = (b: Bar): b is Bar & { open: number; high: number; low: number; close: number } =>
  b.open != null && b.high != null && b.low != null && b.close != null;

export function PriceChart({ bars, fairValue }: { bars: Bar[]; fairValue: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const fvLineRef = useRef<IPriceLine | null>(null);

  // Init once: create chart, series, resize observer. Recreating on every data
  // change (range switch) would flicker — instead the data effect below calls
  // setData on the existing series.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: 420,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: MUTED, fontSize: 11 },
      grid: { vertLines: { color: BORDER }, horzLines: { color: BORDER } },
      rightPriceScale: { borderColor: BORDER },
      timeScale: { borderColor: BORDER, timeVisible: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;
    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    volRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) chart.applyOptions({ width: w });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      fvLineRef.current = null;
    };
  }, []);

  // Update data + fair-value line in place when inputs change.
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    const vol = volRef.current;
    if (!chart || !candle || !vol) return;

    const valid = bars.filter(isBar);
    candle.setData(valid.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    vol.setData(
      valid.map((b) => ({
        time: b.time,
        value: b.volume ?? 0,
        color: b.close >= b.open ? "rgba(63,185,80,0.35)" : "rgba(248,81,73,0.35)",
      })),
    );

    if (fvLineRef.current) {
      candle.removePriceLine(fvLineRef.current);
      fvLineRef.current = null;
    }
    if (fairValue != null && Number.isFinite(fairValue)) {
      fvLineRef.current = candle.createPriceLine({
        price: fairValue,
        color: FV,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "FV",
      });
    }

    chart.timeScale().fitContent();
  }, [bars, fairValue]);

  return <div ref={ref} style={{ width: "100%", height: 420 }} />;
}
