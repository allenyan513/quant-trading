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
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { BacktestResultsSection } from "@/components/backtest/results";
import { BacktestMethodNotes } from "@/components/backtest/method";
import { PresetHub } from "@/components/backtest/preset-links";
import { panel, input, chip, primary, Field, FaqList } from "@/components/backtest/ui";
import {
  MAX_HOLDINGS,
  MAX_YEARS,
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

/** The query string IS the run. Null for a bare load, which the hook treats as
 *  "make no request" — that is what keeps an anonymous landing free of API calls. */
function requestFromParams(params: URLSearchParams): DividendBacktestRequest | null {
  const parsed = parseRows(params.get("p"));
  if (!parsed) return null;
  return {
    holdings: parsed.map((r) => ({ symbol: r.symbol, weight: Number(r.weight) || 0 })),
    from: params.get("from") ?? yearsAgoISO(MAX_YEARS),
    to: params.get("to") ?? todayISO(),
    initial: Number(params.get("initial") ?? 10000),
    reinvest: params.get("drip") !== "0",
  };
}

export default function DividendBacktestPage() {
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState<Row[]>(() => parseRows(params.get("p")) ?? DEFAULT_ROWS);
  const [from, setFrom] = useState(() => params.get("from") ?? yearsAgoISO(MAX_YEARS));
  const [to, setTo] = useState(() => params.get("to") ?? todayISO());
  const [initial, setInitial] = useState(() => params.get("initial") ?? "10000");
  const [reinvest, setReinvest] = useState(() => params.get("drip") !== "0");
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
    setParams({ p, from, to, initial, drip: reinvest ? "1" : "0" });
  }

  function applyExample(ex: (typeof EXAMPLES)[number]) {
    setRows(ex.rows);
    setParams({ p: serializeRows(ex.rows), from, to, initial, drip: reinvest ? "1" : "0" });
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PublicHeader />

      <section style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "clamp(16px, 4vw, 40px) clamp(16px, 5vw, 40px) 8px" }}>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>
          Portfolio Backtest
        </h1>
        <p style={{ fontSize: "clamp(15px, 2vw, 18px)", color: "var(--muted)", lineHeight: 1.55, margin: "12px 0 0", maxWidth: 660 }}>
          Put any basket of stocks or ETFs through real history on <strong style={{ color: "var(--text)" }}>daily</strong> prices —
          total return, drawdown, and what reinvesting the dividends was actually worth, benchmarked against the S&amp;P 500.
          No account, no paywall.
        </p>
      </section>

      {/* Inputs */}
      <section style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "16px clamp(16px, 5vw, 40px)" }}>
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
            <Field label="Start">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
            </Field>
            <Field label="End">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
            </Field>
            <Field label="Initial investment">
              <input value={initial} onChange={(e) => setInitial(e.target.value)} inputMode="decimal" style={{ ...input, width: 130 }} />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, height: 38 }}>
              <input type="checkbox" checked={reinvest} onChange={(e) => setReinvest(e.target.checked)} />
              Reinvest dividends
            </label>
            <button type="submit" disabled={loading} style={{ ...primary, opacity: loading ? 0.6 : 1 }}>
              {loading ? "Running…" : "Run backtest"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "12px 0 0" }}>
            Up to {MAX_HOLDINGS} holdings, {MAX_YEARS} years of history. Weights are relative — they don&apos;t have to add up to 100.
          </p>
        </form>
      </section>

      {/* Results */}
      <section style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "0 clamp(16px, 5vw, 40px)" }}>
        <BacktestResultsSection result={result} loading={loading} error={formError ?? error} shareable />
      </section>

      <PresetHub />

      {/* Method + FAQ — static, and the reason a search engine can tell what this page is */}
      <section style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "24px clamp(16px, 5vw, 40px) 48px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, margin: "0 0 14px" }}>How this backtest works</h2>
        <BacktestMethodNotes variant="full" />

        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, margin: "34px 0 6px" }}>Questions</h2>
        <FaqList items={BACKTEST_FAQ} />
      </section>

      <PublicFooter />
    </main>
  );
}
