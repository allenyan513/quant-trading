"use client";

/**
 * NAV-vs-SPY line chart (both rebased to 100 at inception), built on
 * lightweight-charts. Like price-chart.tsx, this is the ONLY module importing
 * the lib for this view and must be reached through nav-chart.lazy.tsx
 * (ssr:false) — lightweight-charts touches window/DOM and would crash SSR.
 *
 * Theme colors are hardcoded hexes (CSS vars don't resolve inside the canvas).
 */

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";

export interface NavPoint {
  date: string; // YYYY-MM-DD
  nav: number;
  spy: number | null;
}

const NAV = "#58a6ff"; // cool accent (matches --accent; was warm orange)
const SPY = "#8a97ab"; // benchmark (muted gray)
const MUTED = "#8a97ab";
const BORDER = "#232c3d";

export function NavChart({ points }: { points: NavPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const navRef = useRef<ISeriesApi<"Line"> | null>(null);
  const spyRef = useRef<ISeriesApi<"Line"> | null>(null);

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
    navRef.current = chart.addSeries(LineSeries, { color: NAV, lineWidth: 2, priceLineVisible: false });
    spyRef.current = chart.addSeries(LineSeries, { color: SPY, lineWidth: 2, priceLineVisible: false, lastValueVisible: true });

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) chart.applyOptions({ width: w });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      navRef.current = null;
      spyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const nav = navRef.current;
    const spy = spyRef.current;
    if (!chart || !nav || !spy) return;
    nav.setData(points.map((p) => ({ time: p.date, value: p.nav })));
    spy.setData(
      points.filter((p): p is NavPoint & { spy: number } => p.spy != null).map((p) => ({ time: p.date, value: p.spy })),
    );
    chart.timeScale().fitContent();
  }, [points]);

  return <div ref={ref} style={{ width: "100%", height: 420 }} />;
}
