/**
 * Public portfolio backtester — /tools/portfolio-backtest.
 *
 * Deliberately sign-in-free and single-purpose: type tickers + weights, get the
 * reinvested-vs-cash outcome, the income each year, and the dividend cuts you sat
 * through. Every run writes its inputs into the query string (?p=SCHD:60,VYM:40…),
 * so a result is a shareable URL and a reload reproduces it exactly.
 *
 * A bare page load makes NO request (same discipline as the landing page — bots and
 * anonymous readers must not cost gateway calls); only a run, or a link that already
 * carries `p`, hits the API.
 *
 * This page owns the input form and nothing else. Result rendering, the fetch and
 * the methodology copy are shared with the preset landing pages
 * (`components/backtest/*`) so the two surfaces cannot drift apart.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PublicPage, PageSection } from "@/components/public-chrome";
import { BacktestResultsSection } from "@/components/backtest/results";
import { BacktestMethodNotes } from "@/components/backtest/method";
import { PresetHub } from "@/components/backtest/preset-links";
import { panel, input, chip, primary, Field, FaqList } from "@/components/backtest/ui";
import { moneyInputDigits, moneyInputDisplay } from "@/lib/format";
import {
  MAX_HOLDINGS,
  MAX_YEARS,
  DEFAULT_YEARS,
  WINDOW_PRESETS,
  todayISO,
  yearsAgoISO,
  useDividendBacktest,
  type DividendBacktestRequest,
} from "@/lib/backtest";
import { applySeo, BACKTEST_TOOL_SEO, BACKTEST_FAQ } from "@/lib/seo";

interface Row {
  symbol: string;
  weight: string;
}

const DEFAULT_ROWS: Row[] = [
  { symbol: "SCHD", weight: "60" },
  { symbol: "VYM", weight: "40" },
];

const EXAMPLES: Array<{ label: string; rows: Row[] }> = [
  { label: "SCHD + VYM", rows: DEFAULT_ROWS },
  {
    label: "Monthly income",
    rows: [
      { symbol: "O", weight: "40" },
      { symbol: "MAIN", weight: "30" },
      { symbol: "JEPI", weight: "30" },
    ],
  },
  {
    label: "Dividend growth",
    rows: [
      { symbol: "NOBL", weight: "50" },
      { symbol: "VIG", weight: "50" },
    ],
  },
];

/** Starting-stake shortcuts. Round numbers people actually think in — the point is
 *  to skip the typing, so three is enough and a fourth would just be clutter. */
const INITIAL_PRESETS = [
  { value: 10_000, label: "$10K" },
  { value: 100_000, label: "$100K" },
  { value: 1_000_000, label: "$1M" },
];

/** "SCHD:60,VYM:40" ⇄ rows. Weight is optional (defaults to equal-ish 1). */
function parseRows(p: string | null): Row[] | null {
  if (!p) return null;
  const rows = p
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, MAX_HOLDINGS)
    .map((part) => {
      const [symbol, weight] = part.split(":");
      return { symbol: (symbol ?? "").trim().toUpperCase(), weight: (weight ?? "1").trim() };
    })
    .filter((r) => r.symbol);
  return rows.length ? rows : null;
}

const serializeRows = (rows: Row[]): string =>
  rows
    .filter((r) => r.symbol.trim())
    .map((r) => `${r.symbol.trim().toUpperCase()}:${r.weight.trim() || "1"}`)
    .join(",");

/**
 * `?years=10` → a TRAILING window resolved at view time, which is what a shared
 * link should carry. An absolute `from`/`to` pair silently goes stale: a link sent
 * today saying `from=2016-09-06` is an eleven-year window next September. Same rule
 * the preset pages already follow. Absolute dates stay supported for a custom
 * window, and for every link handed out before this existed.
 */
function windowFromParams(params: URLSearchParams): { from: string; to: string } {
  const years = Number(params.get("years"));
  if (Number.isInteger(years) && years >= 1 && years <= MAX_YEARS) {
    return { from: yearsAgoISO(years), to: todayISO() };
  }
  return { from: params.get("from") ?? yearsAgoISO(DEFAULT_YEARS), to: params.get("to") ?? todayISO() };
}

/** The query string IS the run. Null for a bare load, which the hook treats as
 *  "make no request" — that is what keeps an anonymous landing free of API calls. */
function requestFromParams(params: URLSearchParams): DividendBacktestRequest | null {
  const parsed = parseRows(params.get("p"));
  if (!parsed) return null;
  const window = windowFromParams(params);
  return {
    holdings: parsed.map((r) => ({ symbol: r.symbol, weight: Number(r.weight) || 0 })),
    from: window.from,
    to: window.to,
    initial: Number(params.get("initial") ?? 10000),
    // No form control drives this any more — see the note on the results panel.
    // Still PARSED, because `?drip=0` links were handed out (llms.txt documented
    // the format) and a live URL is a promise; it just can't be produced now.
    reinvest: params.get("drip") !== "0",
  };
}

export default function DividendBacktestPage() {
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState<Row[]>(() => parseRows(params.get("p")) ?? DEFAULT_ROWS);
  const [from, setFrom] = useState(() => windowFromParams(params).from);
  const [to, setTo] = useState(() => windowFromParams(params).to);
  /** Which trailing-window chip is active, or null once the dates are hand-edited.
   *  This is what decides whether a run is shared as `years=N` or as absolute dates
   *  — an explicit choice rather than guessing from whether the dates happen to
   *  line up with a preset. */
  const [windowYears, setWindowYears] = useState<number | null>(() => {
    const y = Number(params.get("years"));
    if (Number.isInteger(y) && y >= 1 && y <= MAX_YEARS) return y;
    return params.get("from") || params.get("to") ? null : DEFAULT_YEARS;
  });
  const [initial, setInitial] = useState(() => moneyInputDigits(params.get("initial") ?? "10000"));
  const [formError, setFormError] = useState<string | null>(null);

  // A cold load already carries this route's head tags (the prerender wrote them
  // into its own HTML file); this covers arriving by in-app navigation. The
  // canonical is deliberately the BARE path — a run encodes its inputs in the
  // query string, and every shared `?p=…` link would otherwise be indexed as a
  // separate near-duplicate of this page.
  useEffect(() => applySeo(BACKTEST_TOOL_SEO), []);

  const query = params.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const request = useMemo(() => requestFromParams(params), [query]);
  const { result, error, loading } = useDividendBacktest(request);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = serializeRows(rows);
    if (!p) {
      setFormError("Add at least one ticker.");
      return;
    }
    setFormError(null);
    setParams({ p, ...windowParams(), initial });
  }

  /** A trailing window travels as `years`; a hand-picked one as the dates it is. */
  function windowParams(): Record<string, string> {
    return windowYears === null ? { from, to } : { years: String(windowYears) };
  }

  function applyWindow(years: number) {
    setWindowYears(years);
    setFrom(yearsAgoISO(years));
    setTo(todayISO());
  }

  /** Editing either date by hand drops the chip: the window is no longer "the last
   *  N years", so sharing it as one would be a lie a year from now. */
  function editDate(which: "from" | "to", value: string) {
    setWindowYears(null);
    (which === "from" ? setFrom : setTo)(value);
  }

  function applyExample(ex: (typeof EXAMPLES)[number]) {
    setRows(ex.rows);
    setParams({ p: serializeRows(ex.rows), ...windowParams(), initial });
  }

  return (
    <PublicPage width="wide">

      <PageSection pad="top">
        <h1 style={{ fontSize: "var(--fs-h1)", fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>
          Portfolio Backtest
        </h1>
        <p style={{ fontSize: "var(--fs-lead)", color: "var(--muted)", lineHeight: 1.55, margin: "12px 0 0", maxWidth: "var(--w-prose)" }}>
          Put any basket of stocks or ETFs through real history on <strong style={{ color: "var(--text)" }}>daily</strong> prices —
          total return, drawdown, and what reinvesting the dividends was actually worth, benchmarked against the S&amp;P 500.
          No account, no paywall.
        </p>
      </PageSection>

      {/* Inputs */}
      <PageSection pad="body">
        <form onSubmit={submit} style={panel}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex.label} type="button" onClick={() => applyExample(ex)} style={chip}>
                {ex.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((row, i) => (
              // minWidth: 0 — this row is a grid item, whose default `min-width: auto`
              // would otherwise stop the ticker input from shrinking on a phone.
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                <input
                  value={row.symbol}
                  onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, symbol: e.target.value.toUpperCase() } : r)))}
                  placeholder="Ticker (e.g. SCHD)"
                  aria-label={`Ticker ${i + 1}`}
                  style={{ ...input, flex: 1, minWidth: 0 }}
                />
                <input
                  value={row.weight}
                  onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, weight: e.target.value } : r)))}
                  placeholder="Weight"
                  inputMode="decimal"
                  aria-label={`Weight ${i + 1}`}
                  style={{ ...input, width: 84, flexShrink: 0 }}
                />
                <span style={{ color: "var(--muted)", fontSize: 13, width: 12 }}>%</span>
                <button
                  type="button"
                  onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : rows)}
                  aria-label={`Remove holding ${i + 1}`}
                  style={{ ...chip, width: 34, padding: 0, flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {rows.length < MAX_HOLDINGS && (
            <button type="button" onClick={() => setRows([...rows, { symbol: "", weight: "10" }])} style={{ ...chip, marginTop: 10 }}>
              + Add holding
            </button>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 18, alignItems: "flex-end" }}>
            {/* Trailing-window shortcuts. The date pickers stay — a chip covers the
                common case, not every case — but a chip is what makes a shared link
                survive the calendar, so it is the path most runs should take. */}
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Window</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {WINDOW_PRESETS.map((years) => (
                  <button
                    key={years}
                    type="button"
                    onClick={() => applyWindow(years)}
                    aria-pressed={windowYears === years}
                    style={{
                      ...chip,
                      height: 38,
                      padding: "0 12px",
                      borderColor: windowYears === years ? "var(--accent)" : "var(--border)",
                      color: windowYears === years ? "var(--accent)" : "var(--text)",
                    }}
                  >
                    {years}Y
                  </button>
                ))}
              </div>
            </div>
            <Field label="Start">
              <input type="date" value={from} onChange={(e) => editDate("from", e.target.value)} style={input} />
            </Field>
            <Field label="End">
              <input type="date" value={to} onChange={(e) => editDate("to", e.target.value)} style={input} />
            </Field>
            {/* Not a `Field`: the shortcut chips are buttons, and a button inside a
                `<label>` fires the label's own focus behaviour when clicked. */}
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Initial investment</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ position: "relative" }}>
                  {/* The "$" is an adornment, never part of the value — so the caret
                      never has to step over it and a paste of "$10,000" still works. */}
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 12,
                      top: 0,
                      height: 38,
                      display: "flex",
                      alignItems: "center",
                      color: "var(--muted)",
                      fontSize: 14,
                      pointerEvents: "none",
                    }}
                  >
                    $
                  </span>
                  <input
                    value={moneyInputDisplay(initial)}
                    onChange={(e) => setInitial(moneyInputDigits(e.target.value))}
                    inputMode="numeric"
                    aria-label="Initial investment in US dollars"
                    style={{ ...input, width: 132, paddingLeft: 24 }}
                  />
                </div>
                {INITIAL_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setInitial(String(preset.value))}
                    aria-pressed={initial === String(preset.value)}
                    style={{
                      ...chip,
                      height: 38,
                      padding: "0 10px",
                      fontSize: 12,
                      borderColor: initial === String(preset.value) ? "var(--accent)" : "var(--border)",
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ ...primary, opacity: loading ? 0.6 : 1 }}>
              {loading ? "Running…" : "Run backtest"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "12px 0 0" }}>
            Up to {MAX_HOLDINGS} holdings, {MAX_YEARS} years of history. Weights are relative — they don&apos;t have to add up to 100.
          </p>
        </form>
      </PageSection>

      {/* Results */}
      <PageSection pad="flush">
        <BacktestResultsSection result={result} loading={loading} error={formError ?? error} shareable />
      </PageSection>

      <PresetHub />

      {/* Method + FAQ — static, and the reason a search engine can tell what this page is */}
      <PageSection pad="bottom">
        <h2 style={{ fontSize: "var(--fs-h2)", fontWeight: 800, letterSpacing: -0.3, margin: "0 0 14px" }}>How this backtest works</h2>
        <BacktestMethodNotes variant="full" />

        <h2 style={{ fontSize: "var(--fs-h2)", fontWeight: 800, letterSpacing: -0.3, margin: "34px 0 6px" }}>Questions</h2>
        <FaqList items={BACKTEST_FAQ} />
      </PageSection>

    </PublicPage>
  );
}
