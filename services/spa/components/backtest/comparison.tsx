/**
 * Comparison-page results: one line per fund, one column per fund.
 *
 * Why this is separate from `results.tsx`: a page titled "SCHD vs VYM" must answer
 * a question about the two funds. Running one backtest on a 50/50 basket answers
 * a different one — what a blend did — and the funds never appear. So comparison
 * pages run one backtest per fund and put them side by side.
 *
 * Every figure is dividends-reinvested. Reinvested-vs-cash is the form tool's and
 * the ticker pages' story, not this page's.
 */
import { useMemo } from "react";
import { BacktestChartLazy } from "@/components/backtest-chart.lazy";
import { money, fmtPct, fmtNum } from "@/lib/format";
import { panel, table, h2Style, subStyle, Th, Td } from "@/components/backtest/ui";
import { CutsPanel, ResultsGate, ScrollTable, WarningList } from "@/components/backtest/sections";
import { dividendShare, DIVIDEND_LEAD_THRESHOLD } from "@/lib/backtest";
import type { DividendBacktestResult } from "@qt/shared/backtest";

export interface ComparisonResultsProps {
  symbols: string[];
  results: DividendBacktestResult[];
  initial: number;
  /** The S&P 500 over the same window. Null when one of the subjects IS the S&P. */
  benchmark?: DividendBacktestResult | null;
}

interface Metric {
  label: string;
  sub?: string;
  get: (r: DividendBacktestResult) => number;
  fmt: (v: number) => string;
  tone?: "signed" | "down";
  /** Only meaningful when dividends carried a real share of the return. */
  dividendOnly?: boolean;
}

const METRICS: Metric[] = [
  { label: "Total return", get: (r) => r.drip.totalReturnPct, fmt: (v) => fmtPct(v), tone: "signed" },
  { label: "CAGR", get: (r) => r.drip.cagrPct, fmt: (v) => fmtPct(v), tone: "signed" },
  { label: "Ended at", get: (r) => r.drip.endValue, fmt: (v) => money(v, "headline") },
  { label: "Max drawdown", get: (r) => -r.drip.maxDrawdownPct, fmt: (v) => fmtPct(v), tone: "down" },
  { label: "Volatility (ann.)", get: (r) => r.drip.volatilityPct, fmt: (v) => `${fmtNum(v, 1)}%` },
  { label: "Dividends collected", get: (r) => r.drip.totalIncome, fmt: (v) => money(v, "headline") },
  {
    label: "Yield on cost",
    sub: "last 12m income ÷ initial",
    get: (r) => r.yieldOnCostPct,
    fmt: (v) => `${fmtNum(v, 2)}%`,
    dividendOnly: true,
  },
  {
    label: "Income growth",
    sub: "per year, full calendar years",
    get: (r) => r.incomeCagrPct ?? NaN,
    fmt: (v) => (Number.isNaN(v) ? "—" : `${fmtNum(v, 1)}%`),
    dividendOnly: true,
  },
];

export function ComparisonResults({ symbols, results, initial, benchmark = null }: ComparisonResultsProps) {
  const first = results[0];
  if (!first) return null;

  // Emphasis for the pair: if NEITHER fund's return leaned on dividends, the
  // income rows and the year-by-year table are noise (SPY vs QQQ), so they go.
  const dividendLed = results.some((r) => dividendShare(r) >= DIVIDEND_LEAD_THRESHOLD);
  const rows = METRICS.filter((m) => dividendLed || !m.dividendOnly);

  const chartSeries = useMemo(
    () => [
    ...results.map((r, i) => ({
      label: symbols[i] ?? `Fund ${i + 1}`,
      points: r.series.map((p) => ({ date: p.date, value: p.drip })),
      showLastValue: i === 0,
    })),
    ...(benchmark
      ? [{ label: "S&P 500", points: benchmark.series.map((p) => ({ date: p.date, value: p.drip })), benchmark: true }]
      : []),
    ],
    [results, symbols, benchmark],
  );

  const warnings = [...new Set(results.flatMap((r) => r.warnings))];
  const cuts = results.flatMap((r) => r.dividendCuts);
  const firstYear = Number(first.start.slice(0, 4));
  const lastYear = Number(first.end.slice(0, 4));

  return (
    <>
      <div style={{ ...panel, display: "grid", gap: 18 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {money(initial, "headline")} in each, {fmtNum(first.years, 1)} years ago
          </div>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {first.start} → {first.end} · dividends reinvested
          </span>
        </div>

        <div>
          <BacktestChartLazy series={chartSeries} />
        </div>

        <ScrollTable>
          <thead>
            <tr>
              <Th>&nbsp;</Th>
              {symbols.map((s) => (
                <Th key={s} align="right">
                  {s}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.label}>
                <Td color="var(--muted)">
                  {m.label}
                  {m.sub && <span style={{ fontSize: 11, display: "block" }}>{m.sub}</span>}
                </Td>
                {results.map((r, i) => {
                  const v = m.get(r);
                  const color =
                    m.tone === "down" ? "var(--down)" : m.tone === "signed" ? (v >= 0 ? "var(--up)" : "var(--down)") : undefined;
                  return (
                    <Td key={symbols[i] ?? i} align="right" color={color}>
                      {m.fmt(v)}
                    </Td>
                  );
                })}
              </tr>
            ))}
            {benchmark && (
              <tr>
                <Td color="var(--muted)">
                  vs S&amp;P 500
                  <span style={{ fontSize: 11, display: "block" }}>CAGR difference</span>
                </Td>
                {results.map((r, i) => {
                  const edge = r.drip.cagrPct - benchmark.drip.cagrPct;
                  return (
                    <Td key={symbols[i] ?? i} align="right" color={edge >= 0 ? "var(--up)" : "var(--down)"}>
                      {edge >= 0 ? "+" : ""}
                      {fmtNum(edge, 1)}%
                    </Td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </ScrollTable>

        <WarningList warnings={warnings} />
      </div>

      {dividendLed && (
        <div style={panel}>
          <h2 style={h2Style}>Dividend income by year</h2>
          <p style={subStyle}>What each fund paid on {money(initial, "headline")}, with dividends reinvested.</p>
          <ScrollTable>
            <thead>
              <tr>
                <Th>Year</Th>
                {symbols.map((s) => (
                  <Th key={s} align="right">
                    {s}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i).map((y) => (
                <tr key={y}>
                  <Td>
                    {y}
                    {first.incomeByYear.find((x) => x.year === y)?.partial && (
                      <span style={{ color: "var(--muted)", fontSize: 11 }}> (partial)</span>
                    )}
                  </Td>
                  {results.map((r, i) => (
                    <Td key={symbols[i] ?? i} align="right">
                      {money(r.incomeByYear.find((x) => x.year === y)?.income ?? 0, "headline")}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </div>
      )}

      <CutsPanel
        cuts={cuts}
        emptyText="Neither fund cut its dividend in any full calendar year of this window."
        alwaysShow={dividendLed}
      />
    </>
  );
}

export function ComparisonResultsSection({
  symbols,
  results,
  initial,
  benchmark,
  loading,
  error,
}: Omit<ComparisonResultsProps, "results"> & {
  results: DividendBacktestResult[] | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <ResultsGate error={error} loading={loading} hasResult={results != null && results.length > 0}>
      {results && <ComparisonResults symbols={symbols} results={results} initial={initial} benchmark={benchmark} />}
    </ResultsGate>
  );
}
