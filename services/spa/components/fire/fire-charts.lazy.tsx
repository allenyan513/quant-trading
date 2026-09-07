/**
 * Code-split loader for the FIRE charts — same pattern as backtest-chart.lazy.tsx
 * (Recharts is heavy; this page is a public SEO landing surface, where that
 * matters most). Both charts share one chunk: they always appear together.
 */
import { lazy, Suspense, type ComponentProps } from "react";

const FanChart = lazy(() => import("./fire-charts").then((m) => ({ default: m.FanChart })));
const YearsHistogram = lazy(() => import("./fire-charts").then((m) => ({ default: m.YearsHistogram })));

function ChartFallback({ height }: { height: number }) {
  return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
      Loading chart…
    </div>
  );
}

export function FanChartLazy(props: ComponentProps<typeof FanChart>) {
  return (
    <Suspense fallback={<ChartFallback height={260} />}>
      <FanChart {...props} />
    </Suspense>
  );
}

export function YearsHistogramLazy(props: ComponentProps<typeof YearsHistogram>) {
  return (
    <Suspense fallback={<ChartFallback height={180} />}>
      <YearsHistogram {...props} />
    </Suspense>
  );
}
