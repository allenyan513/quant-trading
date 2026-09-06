"use client";

/**
 * Portfolio-value curve for the backtest — N labelled lines on one axis.
 *
 * Two call sites, asking two different questions with the same component:
 *  - the form tool and the ticker pages plot reinvested vs dividends-as-cash,
 *    where the gap between the lines is the answer;
 *  - comparison pages plot one line per fund, both reinvested, because "SCHD vs
 *    VYM" is a question about the two funds, not about reinvestment.
 *
 * REPLAY. When data arrives the chart does not appear fully drawn: it plays the
 * window forward, the lines sweeping left to right with a live date/value readout
 * in the corner — the "if you had put $10,000 in ten years ago" effect. Two things
 * make it read as a replay rather than a chart that is loading:
 *  - both axes are pinned to the FULL extent before the first point is drawn. The
 *    x-axis is laid out with whitespace points for every date, and the y-axis is
 *    fixed via `autoscaleInfoProvider`; otherwise both would rescale every frame
 *    and the picture would jitter instead of advance.
 *  - progress is time-based, not frame-based, so a 10-year window plays in the
 *    same few seconds on any machine.
 * Honours `prefers-reduced-motion` (no auto-play, Replay stays available).
 *
 * Like nav-chart/price-chart, this is the only module importing lightweight-charts
 * for this view and must be reached through backtest-chart.lazy.tsx (the lib is
 * heavy and touches the DOM). Theme colors are hardcoded hexes (CSS vars don't
 * resolve inside the canvas).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type WhitespaceData,
  type Time,
} from "lightweight-charts";

export interface ChartPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ChartSeries {
  label: string;
  points: ChartPoint[];
  /** Show this line's end-of-line price tag. Tags collide where curves converge,
   *  so only the line the reader is anchoring on should carry one. */
  showLastValue?: boolean;
  /** A reference line (the S&P 500), not a subject. Rendered muted and thinner so
   *  it reads as the backdrop — same convention as the workspace NAV-vs-SPY chart. */
  benchmark?: boolean;
}

/** Line colors in order. Stays inside the palette's meaning-free slots (accent,
 *  warn, up, and one extra) rather than inventing a categorical scheme. */
const LINE_COLORS = ["#58a6ff", "#d29922", "#3fb950", "#a371f7"];
const BENCHMARK = "#8a97ab"; // muted — the backdrop, never a subject
const MUTED = "#8a97ab";
const BORDER = "#232c3d";

/** Replay length. Scales gently with the window so a 5-year run does not crawl and
 *  a 10-year one does not blur past — roughly 2.4ms per trading day, clamped. */
const replayMs = (points: number) => Math.min(8_000, Math.max(3_000, points * 2.4));

/** Subjects take palette colors in order; a benchmark is always the muted one and
 *  never consumes a palette slot. */
function colorAt(series: ChartSeries[], i: number): string {
  if (series[i]?.benchmark) return BENCHMARK;
  const subjectIndex = series.slice(0, i).filter((s) => !s.benchmark).length;
  return LINE_COLORS[subjectIndex % LINE_COLORS.length] as string;
}

const money = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

type Phase = "idle" | "playing" | "done";

export function BacktestChart({ series, height = 340 }: { series: ChartSeries[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<ISeriesApi<"Line">[]>([]);
  const rafRef = useRef<number | null>(null);
  const count = series.length;

  // Replay state. `cursor` is the index of the last revealed point (shared across
  // series — all legs of one window share the same trading days).
  const [phase, setPhase] = useState<Phase>("idle");
  const [cursor, setCursor] = useState(0);

  // Prepared once per data set: full valued arrays plus a whitespace twin that
  // keeps the x-axis laid out before any value is drawn, and the y-extent.
  const prepared = useMemo(() => {
    const valued: LineData<Time>[][] = series.map((s) => s.points.map((p) => ({ time: p.date as Time, value: p.value })));
    const blank: WhitespaceData<Time>[][] = series.map((s) => s.points.map((p) => ({ time: p.date as Time })));
    const values = series.flatMap((s) => s.points.map((p) => p.value));
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    const pad = (max - min) * 0.06 || 1;
    const total = Math.max(0, ...series.map((s) => s.points.length));
    return { valued, blank, total, yRange: { minValue: min - pad, maxValue: max + pad } };
  }, [series]);

  const paint = useCallback(
    (upTo: number) => {
      seriesRefs.current.forEach((s, i) => {
        const v = prepared.valued[i];
        const b = prepared.blank[i];
        if (!v || !b) return;
        s.setData(upTo >= v.length ? v : [...v.slice(0, upTo), ...b.slice(upTo)]);
      });
    },
    [prepared],
  );

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const finish = useCallback(() => {
    stop();
    paint(Number.MAX_SAFE_INTEGER);
    setCursor(Math.max(0, prepared.total - 1));
    setPhase("done");
  }, [stop, paint, prepared.total]);

  const play = useCallback(() => {
    stop();
    if (prepared.total < 2) return finish();
    const duration = replayMs(prepared.total);
    const start = performance.now();
    setPhase("playing");
    paint(1);
    setCursor(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const idx = Math.max(1, Math.floor(t * prepared.total));
      paint(idx);
      setCursor(idx - 1);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else finish();
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stop, finish, paint, prepared.total]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: MUTED,
        fontSize: 11,
        // The library injects its own logo as a `target="_blank"` anchor with no
        // `rel` — an uncontrolled outbound link on every public page that has a
        // chart. Its licence asks for a link to tradingview.com somewhere the user
        // can see, and explicitly allows disabling the logo when that requirement
        // is met another way: we render our own credit under the legend below.
        attributionLogo: false,
      },
      // Whole dollars on the axis. The default 2-decimal format prints
      // "$32,128.33" six times down the scale, which is noise on a ten-year curve
      // where the reader is judging shape, not cents.
      localization: { priceFormatter: (v: number) => money(v) },
      grid: { vertLines: { color: BORDER }, horzLines: { color: BORDER } },
      // Headroom so the end-of-line labels aren't pinned against the frame.
      rightPriceScale: { borderColor: BORDER, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderColor: BORDER, timeVisible: false },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;
    seriesRefs.current = Array.from({ length: count }, (_, i) =>
      chart.addSeries(LineSeries, {
        color: colorAt(series, i),
        lineWidth: series[i]?.benchmark ? 1 : 2,
        priceLineVisible: false,
        lastValueVisible: false,
      }),
    );

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) chart.applyOptions({ width: w });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRefs.current = [];
    };
    // Rebuild only when the number of lines changes; data updates go through the
    // effect below without tearing down the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, count]);

  // New data: pin both axes to the full extent, then either replay or, for
  // readers who asked for less motion, draw it complete with Replay on offer.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || seriesRefs.current.length === 0) return;
    seriesRefs.current.forEach((s, i) => {
      const src = series[i];
      if (!src) return;
      s.applyOptions({
        lastValueVisible: src.showLastValue ?? false,
        // Pin the y-axis: without this it would autoscale to the revealed points
        // and stretch every frame.
        autoscaleInfoProvider: () => ({ priceRange: prepared.yRange }),
      });
    });
    // Whitespace for every date lays the x-axis out in full before anything is
    // drawn, so fitContent() here fixes the frame the lines will sweep into.
    paint(0);
    chart.timeScale().fitContent();

    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) finish();
    else play();
    return stop;
  }, [series, prepared, paint, play, finish, stop]);

  const cursorDate = series[0]?.points[cursor]?.date ?? series[0]?.points.at(-1)?.date;

  return (
    <div>
      <div style={{ position: "relative" }}>
        <div ref={ref} style={{ width: "100%" }} />
        {/* Live readout — the number the replay is really about. */}
        {cursorDate && (
          <div
            aria-live="off"
            style={{
              position: "absolute",
              top: 10,
              left: 12,
              pointerEvents: "none",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.25,
            }}
          >
            <div style={{ fontSize: 12, color: MUTED }}>{cursorDate}</div>
            {series.map((s, i) => {
              if (s.benchmark) return null;
              const v = s.points[cursor]?.value ?? s.points.at(-1)?.value;
              if (v == null) return null;
              return (
                <div key={s.label} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: i === 0 ? 22 : 15, fontWeight: 700, color: colorAt(series, i) }}>{money(v)}</span>
                  <span style={{ fontSize: 11, color: MUTED }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 12, color: "var(--muted)", marginTop: 8, alignItems: "center" }}>
        {series.map((s, i) => (
          <span key={s.label}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 2,
                background: colorAt(series, i),
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            {s.label}
          </span>
        ))}
        <button
          type="button"
          onClick={phase === "playing" ? finish : play}
          style={{
            marginLeft: "auto",
            height: 26,
            padding: "0 10px",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {phase === "playing" ? "Skip" : "▶ Replay"}
        </button>
        {/* Attribution required by lightweight-charts' licence, in place of its
            injected logo — and unlike that logo, this one carries a `rel`. */}
        <a href="https://www.tradingview.com/" target="_blank" rel="noopener nofollow" style={{ color: "var(--muted)" }}>
          Charts by TradingView
        </a>
      </div>
    </div>
  );
}
