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
import { useMemo, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { BacktestChartLazy } from "@/components/backtest-chart.lazy";
import { money, fmtPct, fmtNum } from "@/lib/format";
import { panel, h2Style, subStyle, Kpi, ReplayButton, SpeedToggle, Th, Td } from "@/components/backtest/ui";
import { CutsPanel, IncomeSummaryLine, ResultsGate, ScrollTable, WarningList } from "@/components/backtest/sections";
import { dividendShare, holdingsLabel, statsThrough, yearsAgoLabel, DIVIDEND_LEAD_THRESHOLD } from "@/lib/backtest";
import type { DividendBacktestResult } from "@qt/shared/backtest";
import type { ReplayControls } from "@/components/backtest-chart";

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

/** Tiles the replay cannot drive. Dimmed, not hidden: the figure is still true
 *  for the whole window, it just is not the one moving. */
const DIMMED = { opacity: 0.35, transition: "opacity 200ms" } as const;

export function BacktestResults({ result, benchmark = null, shareable = false }: BacktestResultsProps) {
  const stats = result.reinvest ? result.drip : result.noDrip;
  const dripEdge = result.drip.endValue - result.noDrip.endValue;
  const share = dividendShare(result);
  const dividendLed = share >= DIVIDEND_LEAD_THRESHOLD;
  const benchEdge = benchmark ? stats.cagrPct - benchmark.drip.cagrPct : null;

  /** Replay cursor published by the chart; null whenever it is not replaying. */
  const [replayAt, setReplayAt] = useState<number | null>(null);
  /** The chart's own play/skip, so the button can live up in the headline row. */
  const replay = useRef<ReplayControls | null>(null);
  /** Remembered for the rest of the session: someone who wanted 2x once wants it again. */
  const [speed, setSpeed] = useState<1 | 2>(1);
  const replaying = replayAt !== null;

  // The four value-derived tiles, recomputed over the revealed prefix while the
  // chart replays and falling back to the server's own figures at rest. At the
  // final frame the two agree exactly — `statsThrough` runs the engine's formulas.
  const dripPath = useMemo(() => result.series.map((p) => ({ date: p.date, value: p.drip })), [result]);
  const live =
    (replayAt !== null ? statsThrough(dripPath, result.initial, replayAt) : null) ?? {
      totalReturnPct: stats.totalReturnPct,
      cagrPct: stats.cagrPct,
      maxDrawdownPct: stats.maxDrawdownPct,
      volatilityPct: stats.volatilityPct,
    };

  const benchPath = useMemo(
    () => (benchmark ? benchmark.series.map((p) => ({ date: p.date, value: p.drip })) : null),
    [benchmark],
  );
  const liveBenchEdge =
    replayAt !== null && benchPath
      ? live.cagrPct - (statsThrough(benchPath, result.initial, replayAt)?.cagrPct ?? 0)
      : (benchEdge ?? 0);

  // Memoised on the data, NOT rebuilt per render. The chart re-feeds its series and
  // snaps back to the full window whenever this array's identity changes, so an
  // inline literal would abort a running replay on any unrelated parent re-render.
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
            {money(result.initial, "headline", { decimals: 0 })} in {holdingsLabel(result.holdings.map((h) => h.symbol))},{" "}
            {yearsAgoLabel(result.years)} → {money(stats.endValue, "headline")}
          </div>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {result.start} → {result.end} · {result.reinvest ? "dividends reinvested" : "dividends as cash"}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {shareable && <CopyLinkButton />}
            {replaying && <SpeedToggle speed={speed} onChange={setSpeed} />}
            <ReplayButton playing={replaying} onClick={() => (replaying ? replay.current?.skip() : replay.current?.play())} />
          </div>
        </div>

        {/* While the chart replays, these move with it — they are the point of
            watching. The two INCOME tiles cannot follow (see `statsThrough`) and
            are dimmed rather than left showing a final figure beside four that are
            still climbing, which would read as the wrong number, not a still one. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 14 }}>
          <Kpi label="Total return" value={fmtPct(live.totalReturnPct)} tone={live.totalReturnPct >= 0 ? "up" : "down"} />
          <Kpi label="CAGR" value={fmtPct(live.cagrPct)} tone={live.cagrPct >= 0 ? "up" : "down"} />
          <Kpi label="Max drawdown" value={fmtPct(-live.maxDrawdownPct)} tone="down" />
          <Kpi label="Volatility (ann.)" value={`${fmtNum(live.volatilityPct, 1)}%`} />
          <div style={replaying ? DIMMED : undefined}>
            <Kpi label="Dividends collected" value={money(stats.totalIncome, "headline")} />
          </div>
          {/* The sixth tile is whichever question this basket actually raises. */}
          {dividendLed || benchEdge == null ? (
            <div style={replaying ? DIMMED : undefined}>
              <Kpi label="Yield on cost" value={`${fmtNum(result.yieldOnCostPct, 2)}%`} sub="last 12m income ÷ initial" />
            </div>
          ) : (
            <Kpi
              label="vs S&P 500"
              value={`${liveBenchEdge >= 0 ? "+" : ""}${fmtNum(liveBenchEdge, 1)}%`}
              sub="CAGR difference"
              tone={liveBenchEdge >= 0 ? "up" : "down"}
            />
          )}
        </div>

        <div>
          <BacktestChartLazy speed={speed} series={chartSeries} onReplayFrame={setReplayAt} controls={replay} />
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

/**
 * Copy the run's URL — icon only.
 *
 * Quiet by design: it sits beside the solid Replay, and sharing a run matters less
 * than watching one. The label lives in `aria-label`/`title` rather than on screen,
 * and the tick that replaces the link glyph is the whole confirmation.
 */
function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        // The tick means it worked. `writeText` rejects for reasons that have
        // nothing to do with the user — an unfocused document, a permissions
        // policy — and the old version let that reject unhandled AND left the
        // button silent. Showing the tick anyway would be worse than silence.
        try {
          await navigator.clipboard.writeText(window.location.href);
        } catch {
          return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      aria-label={copied ? "Result link copied" : "Copy result link"}
      title={copied ? "Copied" : "Copy result link"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "transparent",
        color: copied ? "var(--up)" : "var(--muted)",
        cursor: "pointer",
      }}
    >
      {copied ? <Check size={15} /> : <Link2 size={15} />}
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
