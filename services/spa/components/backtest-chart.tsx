"use client";

/**
 * Portfolio-value curve for the dividend backtest — N labelled lines on one axis.
 *
 * Two call sites, asking two different questions with the same component:
 *  - the form tool and single-fund pages plot reinvested vs dividends-as-cash,
 *    where the gap between the lines is the answer;
 *  - comparison pages plot one line per fund, both reinvested, because "SCHD vs
 *    VYM" is a question about the two funds, not about reinvestment.
 *
 * Like nav-chart/price-chart, this is the only module importing lightweight-charts
 * for this view and must be reached through backtest-chart.lazy.tsx (the lib is
 * heavy and touches the DOM).
 *
 * Theme colors are hardcoded hexes (CSS vars don't resolve inside the canvas).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createChart, LineSeries, ColorType, type IChartApi, type ISeriesApi } from "lightweight-charts";

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
 *  muted, warn) rather than inventing a categorical scheme. */
const LINE_COLORS = ["#58a6ff", "#d29922", "#3fb950", "#a371f7"];
const BENCHMARK = "#8a97ab"; // muted — the backdrop, never a subject
const MUTED = "#8a97ab";
const BORDER = "#232c3d";

/** Subjects take palette colors in order; a benchmark is always the muted one and
 *  never consumes a palette slot. */
function colorAt(series: ChartSeries[], i: number): string {
  if (series[i]?.benchmark) return BENCHMARK;
  const subjectIndex = series.slice(0, i).filter((s) => !s.benchmark).length;
  return LINE_COLORS[subjectIndex % LINE_COLORS.length] as string;
}

/**
 * The bar spacing at which the whole window exactly fills the plot.
 *
 * This is the chart's zoom FLOOR, and setting it here rather than to a constant is
 * what makes "zoomed all the way out" mean "the whole window" — you cannot shrink
 * the series into a sliver, because there is nothing further out to see.
 *
 * The slack keeps the floor a hair below the true fit: `fitContent()` and this
 * calculation round independently, and a floor even marginally too high is exactly
 * the bug being fixed — it would clip the outermost bar.
 */
const FIT_SLACK = 0.97;

export function fitBarSpacing(plotWidth: number, points: number): number | null {
  if (!Number.isFinite(plotWidth) || !Number.isFinite(points)) return null;
  if (plotWidth <= 0 || points < 2) return null;
  return (plotWidth / points) * FIT_SLACK;
}

// ============================================================
// Replay — the arithmetic, kept pure and beside the component so it can be read
// without a canvas or a clock.
//
// The animation widens the VISIBLE RANGE from a narrow opening window out to the
// whole series; the data is drawn once and never touched. Two earlier attempts
// animated the data instead, re-feeding `setData` with a growing prefix each
// frame, and both shipped the same bug: the chart started EMPTY and only filled
// in if the animation ran, so a background tab or a throttled frame loop left a
// blank frame forever. Widening a range cannot do that — the series is already
// complete, and the worst an interrupted replay leaves is a zoomed-in view, which
// `finish()` and the Skip button both undo.
// ============================================================

/**
 * Thirty seconds, flat, whatever the window.
 *
 * Long on purpose. This is not a loading flourish — it is the reader watching a
 * decade happen, and the numbers above the chart moving with it. Scaling it by
 * point count (an earlier attempt) only made a five-year run feel rushed and a
 * twenty-year one feel arbitrary; every window deserves the same half minute.
 */
export const REPLAY_MS = 30_000;

export function replayDurationMs(points: number): number {
  return points >= 2 ? REPLAY_MS : 0;
}

/** Elapsed → progress in [0,1]. Time-based, not frame-based, so the replay lasts
 *  the same few seconds on a 144Hz monitor and on a throttled laptop. */
export function progressAt(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(1, elapsedMs / durationMs);
}

/**
 * The window the replay opens on — roughly a quarter of trading days, and never
 * more than a twentieth of the series so a short window still gets an animation.
 *
 * Not 1: two points stretched across the plot is a single enormous zigzag, not a
 * chart.
 */
export function openingWindow(points: number): number {
  if (!Number.isFinite(points) || points < 2) return 0;
  return Math.max(2, Math.min(60, Math.round(points / 20)));
}

/**
 * Right-hand edge of the visible range at progress `t`, as a logical index.
 *
 * Linear in the index, so every year of history gets the same amount of screen
 * time — the alternative (constant zoom rate) spends most of the replay on the
 * first few months and then races through the recent years.
 */
export function revealedIndex(t: number, points: number): number {
  if (!Number.isFinite(points) || points < 2) return 0;
  const last = points - 1;
  const start = openingWindow(points);
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 1;
  return Math.min(last, Math.round(start + (last - start) * clamped));
}

export interface BacktestChartProps {
  series: ChartSeries[];
  height?: number;
  /**
   * Called on every replay frame with the index the window now reaches, and with
   * `null` the moment the replay ends.
   *
   * This is how the figures ABOVE the chart move with it: the chart owns the clock
   * (it is the thing being animated) and publishes the cursor; whoever renders the
   * numbers slices its own data to that index. Nothing about the chart's own
   * behaviour depends on anyone listening.
   */
  onReplayFrame?: (revealed: number | null) => void;
}

export function BacktestChart({ series, height = 340, onReplayFrame }: BacktestChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<ISeriesApi<"Line">[]>([]);
  const count = series.length;
  const points = useMemo(() => Math.max(0, ...series.map((s) => s.points.length)), [series]);
  // Read through a ref, so `applyFit` can stay identity-stable and the long-lived
  // ResizeObserver below cannot capture a stale count. Switching the tool's window
  // from 10 to 20 years changes the point count WITHOUT changing the line count,
  // so the observer's effect does not re-run and a closed-over `points` would be
  // the old one — the floor would then be too high for the new data.
  const pointsRef = useRef(points);
  pointsRef.current = points;

  /** Right edge of the visible range while replaying; `null` when not replaying —
   *  which is also the resting state, and the only state a visitor who never
   *  presses the button will ever see. */
  const [revealed, setRevealed] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  // Latest listener, read through a ref so `play`/`finish` stay identity-stable and
  // a parent that passes an inline arrow cannot restart the machinery each render.
  const onFrameRef = useRef(onReplayFrame);
  onFrameRef.current = onReplayFrame;
  const publish = useCallback((v: number | null) => {
    setRevealed(v);
    onFrameRef.current?.(v);
  }, []);

  /**
   * Lower the zoom floor to whatever this chart's data and width actually need,
   * and optionally snap to the full window.
   *
   * `minBarSpacing` defaults to 0.5px per bar and `fitContent()` cannot compress
   * past it. A ten-year daily series is ~2,500 bars: it needs 0.32px per bar in an
   * 800px plot and 0.12px on a phone, so the default silently clamped the zoom and
   * pushed the earliest years off the left edge — where the reader had to drag to
   * find them and could not zoom out to bring them back. Measured before this fix:
   * a ten-year chart showed 2.4 years at 375px wide.
   *
   * The floor exists to stop bars becoming sub-pixel mush on a candlestick chart.
   * This is a smooth line, so it has nothing to protect here.
   */
  const applyFit = useCallback(
    (opts: { snap: boolean }) => {
      const chart = chartRef.current;
      if (!chart) return;
      const timeScale = chart.timeScale();
      // The time scale spans the plot only — the price axis is not part of it.
      // Fall back to the container minus the axis if it has not been laid out yet.
      const plotWidth = timeScale.width() || (ref.current?.clientWidth ?? 0) - chart.priceScale("right").width();
      const spacing = fitBarSpacing(plotWidth, pointsRef.current);
      if (spacing == null) return;
      timeScale.applyOptions({ minBarSpacing: spacing });
      if (opts.snap) timeScale.fitContent();
    },
    [],
  );

  /** End the replay: the whole window, controls back, no leftover frame pending.
   *  Everything that can stop a replay routes through here, so "stopped" and
   *  "showing the complete chart" are the same state. */
  const finish = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    publish(null);
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({ handleScroll: true, handleScale: true });
    applyFit({ snap: true });
  }, [applyFit, publish]);

  const play = useCallback(() => {
    const chart = chartRef.current;
    const total = pointsRef.current;
    if (!chart || total < 2) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const timeScale = chart.timeScale();
    const duration = replayDurationMs(total);
    // The reader's wheel and the replay would otherwise fight over the same range.
    chart.applyOptions({ handleScroll: false, handleScale: false });

    let start = 0;
    const tick = (now: number) => {
      try {
        // Clock starts on the first frame actually delivered, so a throttled tab
        // cannot burn the whole replay before anyone sees it.
        if (!start) start = now;
        const t = progressAt(now - start, duration);
        const to = revealedIndex(t, total);
        timeScale.setVisibleLogicalRange({ from: 0, to });
        publish(to);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      } catch {
        // Never leave the chart parked on a partial range because a frame threw.
      }
      finish();
    };
    publish(revealedIndex(0, total));
    rafRef.current = requestAnimationFrame(tick);
  }, [finish, publish]);

  // Stop a replay when the component goes away, whatever started it.
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

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
      localization: { priceFormatter: (v: number) => `$${Math.round(v).toLocaleString("en-US")}` },
      grid: { vertLines: { color: BORDER }, horzLines: { color: BORDER } },
      // Headroom so the end-of-line labels aren't pinned against the frame.
      rightPriceScale: { borderColor: BORDER, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: {
        borderColor: BORDER,
        timeVisible: false,
        // NOTE: `minBarSpacing` is deliberately absent here and set at runtime by
        // `applyFit()` — it depends on how many points this particular chart got
        // and how wide it ended up. The library's 0.5px default is far too coarse
        // for a daily series (see the comment on `applyFit`).
        //
        // Nothing exists outside the window, so let neither edge scroll into blank
        // space — the whole series is on screen and dragging past it is only ever
        // an accident.
        fixLeftEdge: true,
        fixRightEdge: true,
        // Preserve the reader's own zoom across a container resize. `applyFit()`
        // re-lowers the floor on resize, so a chart sitting at full extent stays at
        // full extent, and one the reader zoomed in stays where they left it.
        lockVisibleTimeRangeOnResize: true,
      },
      crosshair: { mode: 0 },
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
      if (!w || w <= 0) return;
      chart.applyOptions({ width: w });
      // Re-lower the floor for the new width, but do NOT snap: a reader who zoomed
      // into 2020 should still be looking at 2020 after they resize the window.
      // `lockVisibleTimeRangeOnResize` keeps their range; this keeps it reachable.
      applyFit({ snap: false });
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
  }, [height, count]);

  useEffect(() => {
    seriesRefs.current.forEach((s, i) => {
      const src = series[i];
      if (!src) return;
      s.applyOptions({ lastValueVisible: src.showLastValue ?? false });
      s.setData(src.points.map((p) => ({ time: p.date, value: p.value })));
    });
    // New data means a new point count, so the floor has to be recomputed before
    // fitting — otherwise `fitContent()` is clamped and drops the earliest years.
    applyFit({ snap: true });
  }, [series, applyFit]);

  const playing = revealed !== null;

  return (
    <div>
      <div ref={ref} style={{ width: "100%" }} />
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
        {points >= 2 && (
          <button
            type="button"
            onClick={playing ? finish : play}
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
            {playing ? "Skip" : "▶ Replay"}
          </button>
        )}
        {/* Attribution required by lightweight-charts' licence, in place of its
            injected logo — and unlike that logo, this one carries a `rel`. */}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener nofollow"
          style={{ marginLeft: points >= 2 ? undefined : "auto", color: "var(--muted)" }}
        >
          Charts by TradingView
        </a>
      </div>
    </div>
  );
}
