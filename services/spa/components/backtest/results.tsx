/**
 * The backtest result, rendered identically wherever it appears: the form tool
 * and every preset landing page. Pure function of `result` — all fetching lives
 * in `useDividendBacktest` (`lib/backtest.ts`), so the two surfaces cannot drift
 * into lookalike implementations with different behaviour.
 */
import { useState } from "react";
import { BacktestChartLazy } from "@/components/backtest-chart.lazy";
import { money, fmtPct, fmtNum } from "@/lib/format";
import { panel, chip, table, h2Style, subStyle, Kpi, Th, Td } from "@/components/backtest/ui";
import type { DividendBacktestResult } from "@qt/shared/backtest";

export interface BacktestResultsProps {
  result: DividendBacktestResult;
  /** Show "Copy result link". True for the form tool, whose run is encoded in the
   *  query string and therefore worth sharing; false on preset pages, whose URL is
   *  already the canonical static one. */
  shareable?: boolean;
}

export function BacktestResults({ result, shareable = false }: BacktestResultsProps) {
  const stats = result.reinvest ? result.drip : result.noDrip;
  const dripEdge = result.drip.endValue - result.noDrip.endValue;
  // Reinvested vs dividends-as-cash — the question the FORM tool and the
  // single-fund pages ask. Comparison pages use `comparison.tsx` instead, which
  // plots one line per fund.
  const chartSeries = [
    { label: "Dividends reinvested", points: result.series.map((p) => ({ date: p.date, value: p.drip })), showLastValue: true },
    { label: "Dividends taken as cash", points: result.series.map((p) => ({ date: p.date, value: p.noDrip })) },
  ];

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
            <Kpi
              label="Yield on cost"
              value={`${fmtNum(result.yieldOnCostPct, 2)}%`}
              sub="last 12m income ÷ initial"
            />
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

          {result.warnings.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--warn)" }}>
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Income by year */}
        <div style={panel}>
          <h2 style={h2Style}>Dividend income by year</h2>
          <p style={subStyle}>
            {result.incomeCagrPct == null
              ? "Income growth needs two full calendar years in the window."
              : `Income grew ${fmtNum(result.incomeCagrPct, 1)}% a year across the full calendar years.`}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
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
            </table>
          </div>
        </div>

        {/* Per holding */}
        <div style={panel}>
          <h2 style={h2Style}>By holding</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
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
            </table>
          </div>
          <p style={{ ...subStyle, marginTop: 10 }}>
            Per-holding yield on cost is the last 12 months of dividends per share over the entry price.
          </p>
        </div>

        {/* Cuts */}
        <div style={panel}>
          <h2 style={h2Style}>Dividend cuts in this window</h2>
          {result.dividendCuts.length === 0 ? (
            <p style={subStyle}>No holding cut its dividend in any full calendar year of this window.</p>
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
                  {result.dividendCuts.map((c) => (
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

/**
 * The error / loading / result three-way. Preset pages fetch on mount, so an
 * explicit loading panel matters here — without one a search visitor lands on a
 * blank gap where the numbers belong.
 */
export function BacktestResultsSection({ result, loading, error, shareable }: BacktestResultsSectionProps) {
  if (error) {
    return (
      // String(): a non-string reaching this panel used to blank the whole page.
      <div style={{ ...panel, borderColor: "var(--down)", color: "var(--down)", fontSize: 14 }}>{String(error)}</div>
    );
  }
  if (loading) {
    return <div style={{ ...panel, color: "var(--muted)", fontSize: 14 }}>Running the backtest…</div>;
  }
  if (!result) return null;
  return <BacktestResults result={result} shareable={shareable} />;
}
