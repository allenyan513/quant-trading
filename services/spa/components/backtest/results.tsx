/**
 * The backtest result for a SINGLE basket: the free-form tool and the ticker
 * landing pages. Comparison pages use `comparison.tsx`, which plots one line per
 * fund instead. Pure function of its props — all fetching lives in
 * `useDividendBacktest` (`lib/backtest.ts`).
 *
 * What leads the page is MEASURED, not declared: `dividendShare` decides whether
 * the income tables get their own panels or collapse to one sentence, so a user
 * typing QQQ into the form gets the same correct emphasis as a preset page.
 */
import { useMemo, useState } from "react";
import { BacktestChartLazy } from "@/components/backtest-chart.lazy";
import { money, fmtPct, fmtNum } from "@/lib/format";
import { panel, chip, h2Style, subStyle, Kpi, Th, Td } from "@/components/backtest/ui";
import { CutsPanel, IncomeSummaryLine, ResultsGate, ScrollTable, WarningList } from "@/components/backtest/sections";
import { dividendShare, DIVIDEND_LEAD_THRESHOLD } from "@/lib/backtest";
import type { DividendBacktestResult } from "@qt/shared/backtest";

export interface BacktestResultsProps {
  result: DividendBacktestResult;
  /** The S&P 500 over the same window — the backdrop line and the "vs S&P 500"
   *  tile. Null when the subject IS the benchmark, or on the form tool. */
  benchmark?: DividendBacktestResult | null;
  /** Show "Copy result link". True for the form tool, whose run is encoded in the
   *  query string and therefore worth sharing; false on preset pages, whose URL is
   *  already the canonical static one. */
  shareable?: boolean;
}

export function BacktestResults({ result, benchmark = null, shareable = false }: BacktestResultsProps) {
  const stats = result.reinvest ? result.drip : result.noDrip;
  const dripEdge = result.drip.endValue - result.noDrip.endValue;
  const share = dividendShare(result);
  const dividendLed = share >= DIVIDEND_LEAD_THRESHOLD;
  const benchEdge = benchmark ? stats.cagrPct - benchmark.drip.cagrPct : null;

  const chartSeries = useMemo(
    () => [
    { label: "Dividends reinvested", points: result.series.map((p) => ({ date: p.date, value: p.drip })), showLastValue: true },
    { label: "Dividends taken as cash", points: result.series.map((p) => ({ date: p.date, value: p.noDrip })) },
    ...(benchmark
      ? [{ label: "S&P 500", points: benchmark.series.map((p) => ({ date: p.date, value: p.drip })), benchmark: true }]
      : []),
    ],
    [result, benchmark],
  );

  return (
    <>
      <div style={{ ...panel, display: "grid", gap: 18 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {money(result.initial, "headline")} → {money(stats.endValue, "headline")}
          </div>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {result.start} → {result.end} · {fmtNum(result.years, 1)} years · {result.reinvest ? "reinvested" : "dividends as cash"}
          </span>
          {shareable && <CopyLinkButton />}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 14 }}>
          <Kpi label="Total return" value={fmtPct(stats.totalReturnPct)} tone={stats.totalReturnPct >= 0 ? "up" : "down"} />
          <Kpi label="CAGR" value={fmtPct(stats.cagrPct)} tone={stats.cagrPct >= 0 ? "up" : "down"} />
          <Kpi label="Max drawdown" value={fmtPct(-stats.maxDrawdownPct)} tone="down" />
          <Kpi label="Volatility (ann.)" value={`${fmtNum(stats.volatilityPct, 1)}%`} />
          <Kpi label="Dividends collected" value={money(stats.totalIncome, "headline")} />
          {/* The sixth tile is whichever question this basket actually raises. */}
          {dividendLed || benchEdge == null ? (
            <Kpi label="Yield on cost" value={`${fmtNum(result.yieldOnCostPct, 2)}%`} sub="last 12m income ÷ initial" />
          ) : (
            <Kpi
              label="vs S&P 500"
              value={`${benchEdge >= 0 ? "+" : ""}${fmtNum(benchEdge, 1)}%`}
              sub="CAGR difference"
              tone={benchEdge >= 0 ? "up" : "down"}
            />
          )}
        </div>

        <div>
          <BacktestChartLazy series={chartSeries} />
        </div>

        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
          Reinvesting ended{" "}
          <strong style={{ color: dripEdge >= 0 ? "var(--up)" : "var(--down)" }}>
            {money(Math.abs(dripEdge), "headline")} {dripEdge >= 0 ? "ahead of" : "behind"}
          </strong>{" "}
          taking the dividends as cash ({money(result.drip.endValue, "headline")} vs {money(result.noDrip.endValue, "headline")}, of
          which {money(result.noDrip.endCash, "headline")} sits as uninvested cash).
        </div>

        <WarningList warnings={result.warnings} />
      </div>

      {/* Income by year — a full panel only when dividends actually carried the
          return. Below the threshold it would be eleven rows of small change. */}
      {dividendLed ? (
        <div style={panel}>
          <h2 style={h2Style}>Dividend income by year</h2>
          <p style={subStyle}>
            {result.incomeCagrPct == null
              ? "Income growth needs two full calendar years in the window."
              : `Income grew ${fmtNum(result.incomeCagrPct, 1)}% a year across the full calendar years.`}
          </p>
          <ScrollTable>
            <thead>
              <tr>
                <Th>Year</Th>
                <Th align="right">Income</Th>
                <Th align="right">On initial cost</Th>
                <Th align="right">vs prior year</Th>
              </tr>
            </thead>
            <tbody>
              {result.incomeByYear.map((y) => (
                <tr key={y.year}>
                  <Td>
                    {y.year}
                    {y.partial && <span style={{ color: "var(--muted)", fontSize: 11 }}> (partial)</span>}
                  </Td>
                  <Td align="right">{money(y.income, "headline")}</Td>
                  <Td align="right">{fmtNum(y.yieldOnCostPct, 2)}%</Td>
                  <Td align="right" color={y.growthPct == null ? undefined : y.growthPct >= 0 ? "var(--up)" : "var(--down)"}>
                    {y.growthPct == null ? "—" : fmtPct(y.growthPct)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </div>
      ) : (
        <IncomeSummaryLine income={stats.totalIncome} sharePct={share * 100} dripEdge={dripEdge} />
      )}

      {/* Per holding — only says something when there is more than one. */}
      {result.holdings.length > 1 && (
        <div style={panel}>
          <h2 style={h2Style}>By holding</h2>
          <ScrollTable>
            <thead>
              <tr>
                <Th>Symbol</Th>
                <Th align="right">Weight</Th>
                <Th align="right">Invested</Th>
                <Th align="right">Ended at</Th>
                <Th align="right">Total return</Th>
                <Th align="right">Dividends</Th>
                <Th align="right">Yield on cost</Th>
              </tr>
            </thead>
            <tbody>
              {result.holdings.map((h) => (
                <tr key={h.symbol}>
                  <Td>{h.symbol}</Td>
                  <Td align="right">{fmtNum(h.weightPct, 0)}%</Td>
                  <Td align="right">{money(h.startValue, "headline")}</Td>
                  <Td align="right">{money(h.endValue, "headline")}</Td>
                  <Td align="right" color={h.totalReturnPct >= 0 ? "var(--up)" : "var(--down)"}>
                    {fmtPct(h.totalReturnPct)}
                  </Td>
                  <Td align="right">{money(h.totalIncome, "headline")}</Td>
                  <Td align="right">{fmtNum(h.perShareYieldOnCostPct, 2)}%</Td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
          <p style={{ ...subStyle, marginTop: 10 }}>
            Per-holding yield on cost is the last 12 months of dividends per share over the entry price.
          </p>
        </div>
      )}

      <CutsPanel
        cuts={result.dividendCuts}
        emptyText="No holding cut its dividend in any full calendar year of this window."
        alwaysShow={dividendLed}
      />
    </>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{ ...chip, marginLeft: "auto" }}
    >
      {copied ? "Link copied" : "Copy result link"}
    </button>
  );
}

export interface BacktestResultsSectionProps extends Omit<BacktestResultsProps, "result"> {
  result: DividendBacktestResult | null;
  loading: boolean;
  error: string | null;
}

export function BacktestResultsSection({ result, loading, error, benchmark, shareable }: BacktestResultsSectionProps) {
  return (
    <ResultsGate error={error} loading={loading} hasResult={result != null}>
      {result && <BacktestResults result={result} benchmark={benchmark} shareable={shareable} />}
    </ResultsGate>
  );
}
