/**
 * Code-split loader for BacktestChart — same pattern as nav-chart.lazy.tsx
 * (lightweight-charts is heavy and DOM-bound, so it stays out of the main bundle;
 * this page is a public SEO landing surface, where that matters most).
 */
import { lazy, Suspense, type ComponentProps } from "react";
import type { ChartSeries } from "./backtest-chart";

const BacktestChart = lazy(() => import("./backtest-chart").then((m) => ({ default: m.BacktestChart })));

export function BacktestChartLazy(props: ComponentProps<typeof BacktestChart>) {
  return (
    <Suspense
      fallback={
        <div style={{ height: 340, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
          Loading chart…
        </div>
      }
    >
      <BacktestChart {...props} />
    </Suspense>
  );
}

export type { ChartSeries };
