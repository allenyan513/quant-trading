/**
 * Comparison-page results: one line per fund, one column per fund.
 *
 * The reason this exists separately from `results.tsx`: a page titled "SCHD vs
 * VYM" must answer a question about the two funds. Running one backtest on a
 * 50/50 basket answers a different one — what a blend of them did, with the two
 * chart lines being reinvested-vs-cash on that blend. The funds themselves never
 * appear. So comparison pages run one backtest per fund and put them side by side.
 *
 * Every figure here is dividends-reinvested. The reinvested-vs-cash question is
 * the form tool's and the single-fund pages' story, not this page's.
 */
import { BacktestChartLazy } from "@/components/backtest-chart.lazy";
import { money, fmtPct, fmtNum } from "@/lib/format";
import { panel, table, h2Style, subStyle, Th, Td } from "@/components/backtest/ui";
import type { DividendBacktestResult } from "@qt/shared/backtest";

export interface ComparisonResultsProps {
  symbols: string[];
  results: DividendBacktestResult[];
  initial: number;
}

/** Metric rows. `fmt` returns the display string; `tone` colors it when signed. */
const METRICS: Array<{
  label: string;
  sub?: string;
  get: (r: DividendBacktestResult) => number;
  fmt: (v: number) => string;
  tone?: "signed" | "down";
}> = [
  { label: "Total return", get: (r) => r.drip.totalReturnPct, fmt: (v) => fmtPct(v), tone: "signed" },
  { label: "CAGR", get: (r) => r.drip.cagrPct, fmt: (v) => fmtPct(v), tone: "signed" },
  { label: "Ended at", get: (r) => r.drip.endValue, fmt: (v) => money(v, "headline") },
  { label: "Dividends collected", get: (r) => r.drip.totalIncome, fmt: (v) => money(v, "headline") },
  { label: "Yield on cost", sub: "last 12m income ÷ initial", get: (r) => r.yieldOnCostPct, fmt: (v) => `${fmtNum(v, 2)}%` },
  { label: "Income growth", sub: "per year, full calendar years", get: (r) => r.incomeCagrPct ?? NaN, fmt: (v) => (Number.isNaN(v) ? "—" : `${fmtNum(v, 1)}%`) },
  { label: "Max drawdown", get: (r) => -r.drip.maxDrawdownPct, fmt: (v) => fmtPct(v), tone: "down" },
  { label: "Volatility (ann.)", get: (r) => r.drip.volatilityPct, fmt: (v) => `${fmtNum(v, 1)}%` },
];

export function ComparisonResults({ symbols, results, initial }: ComparisonResultsProps) {
  const first = results[0];
  if (!first) return null;

  const chartSeries = results.map((r, i) => ({
    label: symbols[i] ?? `Fund ${i + 1}`,
    points: r.series.map((p) => ({ date: p.date, value: p.drip })),
    showLastValue: i === 0,
  }));

  // Every leg is clamped to the same window by the same rule, so the first one's
  // dates describe all of them.
  const years = first.years;
  const warnings = [...new Set(results.flatMap((r) => r.warnings))];
  const cuts = results.flatMap((r) => r.dividendCuts);
  const years0 = Number(first.start.slice(0, 4));
  const yearsN = Number(first.end.slice(0, 4));

  return (
    <>
      <div style={{ ...panel, display: "grid", gap: 18 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {money(initial, "headline")} in each, {fmtNum(years, 1)} years ago
          </div>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {first.start} → {first.end} · dividends reinvested
          </span>
        </div>

        <div>
          <BacktestChartLazy series={chartSeries} />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={table}>
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
              {METRICS.map((m) => (
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
            </tbody>
          </table>
        </div>

        {warnings.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--warn)" }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      <div style={panel}>
        <h2 style={h2Style}>Dividend income by year</h2>
        <p style={subStyle}>What each fund paid on {money(initial, "headline")}, with dividends reinvested.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
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
              {Array.from({ length: yearsN - years0 + 1 }, (_, i) => years0 + i).map((y) => (
                <tr key={y}>
                  <Td>
                    {y}
                    {results[0]?.incomeByYear.find((x) => x.year === y)?.partial && (
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
          </table>
        </div>
      </div>

      <div style={panel}>
        <h2 style={h2Style}>Dividend cuts in this window</h2>
        {cuts.length === 0 ? (
          <p style={subStyle}>Neither fund cut its dividend in any full calendar year of this window.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <Th>Symbol</Th>
                  <Th>Year</Th>
                  <Th align="right">Paid / share</Th>
                  <Th align="right">Prior year</Th>
                  <Th align="right">Change</Th>
                </tr>
              </thead>
              <tbody>
                {cuts.map((c) => (
                  <tr key={`${c.symbol}-${c.year}`}>
                    <Td>{c.symbol}</Td>
                    <Td>{c.year}</Td>
                    <Td align="right">{money(c.perShare, "headline")}</Td>
                    <Td align="right">{money(c.priorPerShare, "headline")}</Td>
                    <Td align="right" color="var(--down)">
                      {fmtPct(c.changePct)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/** error / loading / results three-way, mirroring BacktestResultsSection. */
export function ComparisonResultsSection({
  symbols,
  results,
  initial,
  loading,
  error,
}: Omit<ComparisonResultsProps, "results"> & { results: DividendBacktestResult[] | null; loading: boolean; error: string | null }) {
  if (error) {
    return <div style={{ ...panel, borderColor: "var(--down)", color: "var(--down)", fontSize: 14 }}>{String(error)}</div>;
  }
  if (loading || !results) {
    return <div style={{ ...panel, color: "var(--muted)", fontSize: 14 }}>Running the backtest…</div>;
  }
  return <ComparisonResults symbols={symbols} results={results} initial={initial} />;
}
