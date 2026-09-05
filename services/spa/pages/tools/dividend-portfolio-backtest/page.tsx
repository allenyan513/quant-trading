/**
 * Public dividend-portfolio backtester — /tools/dividend-portfolio-backtest.
 *
 * Deliberately sign-in-free and single-purpose: type tickers + weights, get the
 * reinvested-vs-cash outcome, the income each year, and the dividend cuts you sat
 * through. Every run writes its inputs into the query string (?p=SCHD:60,VYM:40…),
 * so a result is a shareable URL and a reload reproduces it exactly.
 *
 * A bare page load makes NO request (same discipline as the landing page — bots and
 * anonymous readers must not cost gateway calls); only a run, or a link that already
 * carries `p`, hits the API.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Link from "@/components/link";
import { BacktestChartLazy } from "@/components/backtest-chart.lazy";
import { apiSend } from "@/lib/api-client";
import { money, fmtPct, fmtNum } from "@/lib/format";
import type { DividendBacktestResult } from "@qt/shared/backtest";

const MAX_HOLDINGS = 10;
const MAX_YEARS = 10;
const TITLE = "Dividend Portfolio Backtest — reinvested vs. cash, free, no sign-up";
const DESCRIPTION =
  "Backtest a dividend portfolio on daily prices: total return with and without reinvestment, income by year, yield on cost, and every dividend cut in the window. Free, no account.";

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

const todayISO = (): string => new Date().toISOString().slice(0, 10);
const yearsAgoISO = (n: number): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};

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

export default function DividendBacktestPage() {
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState<Row[]>(() => parseRows(params.get("p")) ?? DEFAULT_ROWS);
  const [from, setFrom] = useState(() => params.get("from") ?? yearsAgoISO(MAX_YEARS));
  const [to, setTo] = useState(() => params.get("to") ?? todayISO());
  const [initial, setInitial] = useState(() => params.get("initial") ?? "10000");
  const [reinvest, setReinvest] = useState(() => params.get("drip") !== "0");

  const [result, setResult] = useState<DividendBacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = TITLE;
    document.querySelector('meta[name="description"]')?.setAttribute("content", DESCRIPTION);
  }, []);

  // The query string is the single source of truth for a run: submitting writes to
  // it, and this effect executes whatever it says — so a pasted link and a fresh
  // run take exactly the same path.
  const query = params.toString();
  const run = useCallback(async () => {
    const p = params.get("p");
    if (!p) return;
    const parsed = parseRows(p);
    if (!parsed) return;
    setLoading(true);
    setError(null);
    const res = await apiSend<DividendBacktestResult>("/api/tools/dividend-backtest", "POST", {
      holdings: parsed.map((r) => ({ symbol: r.symbol, weight: Number(r.weight) || 0 })),
      from: params.get("from") ?? yearsAgoISO(MAX_YEARS),
      to: params.get("to") ?? todayISO(),
      initial: Number(params.get("initial") ?? 10000),
      reinvest: params.get("drip") !== "0",
    });
    setLoading(false);
    if (!res.ok || !res.data) {
      setResult(null);
      setError(res.error ?? "Backtest failed");
      return;
    }
    setResult(res.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    void run();
  }, [run]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = serializeRows(rows);
    if (!p) {
      setError("Add at least one ticker.");
      return;
    }
    setCopied(false);
    setParams({ p, from, to, initial, drip: reinvest ? "1" : "0" });
  }

  function applyExample(ex: (typeof EXAMPLES)[number]) {
    setRows(ex.rows);
    setParams({ p: serializeRows(ex.rows), from, to, initial, drip: reinvest ? "1" : "0" });
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const stats = result ? (result.reinvest ? result.drip : result.noDrip) : null;
  const other = result ? (result.reinvest ? result.noDrip : result.drip) : null;
  const dripEdge = result ? result.drip.endValue - result.noDrip.endValue : 0;
  const points = useMemo(() => result?.series ?? [], [result]);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px clamp(16px, 5vw, 40px)" }}>
        <Link href="/" style={{ flex: 1, fontWeight: 800, letterSpacing: 0.3, fontSize: 16, color: "var(--text)" }}>
          <span style={{ color: "var(--accent)" }}>Sweet</span>ValueLab
        </Link>
        <Link href="/sign-in" style={{ fontSize: 14, color: "var(--muted)" }}>
          Sign in
        </Link>
      </header>

      <section style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "clamp(16px, 4vw, 40px) clamp(16px, 5vw, 40px) 8px" }}>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>
          Dividend Portfolio Backtest
        </h1>
        <p style={{ fontSize: "clamp(15px, 2vw, 18px)", color: "var(--muted)", lineHeight: 1.55, margin: "12px 0 0", maxWidth: 660 }}>
          Put a basket of dividend stocks or ETFs through real history on <strong style={{ color: "var(--text)" }}>daily</strong> prices.
          See what reinvesting actually earned you, what the income did year by year, and which holdings cut their dividend along the way.
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
      <section ref={resultsRef} style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "0 clamp(16px, 5vw, 40px)" }}>
        {error && (
          <div style={{ ...panel, borderColor: "var(--down)", color: "var(--down)", fontSize: 14 }}>{error}</div>
        )}

        {result && stats && other && (
          <>
            <div style={{ ...panel, display: "grid", gap: 18 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                  {money(result.initial, "headline")} → {money(stats.endValue, "headline")}
                </h2>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {result.start} → {result.end} · {fmtNum(result.years, 1)} years · {result.reinvest ? "reinvested" : "dividends as cash"}
                </span>
                <button type="button" onClick={copyLink} style={{ ...chip, marginLeft: "auto" }}>
                  {copied ? "Link copied" : "Copy result link"}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
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
                <BacktestChartLazy points={points} />
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
              <h3 style={h3}>Dividend income by year</h3>
              <p style={sub}>
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
              <h3 style={h3}>By holding</h3>
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
              <p style={{ ...sub, marginTop: 10 }}>
                Per-holding yield on cost is the last 12 months of dividends per share over the entry price.
              </p>
            </div>

            {/* Cuts */}
            <div style={panel}>
              <h3 style={h3}>Dividend cuts in this window</h3>
              {result.dividendCuts.length === 0 ? (
                <p style={sub}>No holding cut its dividend in any full calendar year of this window.</p>
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
        )}
      </section>

      {/* Method + FAQ — static, and the reason a search engine can tell what this page is */}
      <section style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "24px clamp(16px, 5vw, 40px) 48px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, margin: "0 0 14px" }}>How this backtest works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 22 }}>
          <Note title="Daily bars, not monthly">
            The portfolio is marked to market every trading day, so drawdowns and volatility reflect what actually happened between
            month-ends — 252 observations a year instead of 12.
          </Note>
          <Note title="Split-adjusted prices, cash dividends">
            Prices are split-adjusted closes; each dividend is applied as cash on its ex-date at the matching split-adjusted per-share
            amount. Dividend-adjusted (&ldquo;total return&rdquo;) prices are never used, so income is counted exactly once.
          </Note>
          <Note title="Reinvestment at the close">
            With reinvestment on, each dividend buys fractional shares at that day&apos;s close. With it off, the cash sits idle and earns
            nothing — the honest floor for the comparison.
          </Note>
          <Note title="Buy and hold, no rebalancing">
            Weights set the opening trade and then drift, which is what a buy-and-hold holder experienced. No contributions, no rebalancing,
            no taxes, no commissions.
          </Note>
          <Note title="The window is the overlap">
            If one holding is younger than the others, the test starts where all of them have prices — and says so, rather than quietly
            testing different lengths of history.
          </Note>
          <Note title="Cuts you actually took">
            A year counts as a cut only if both the annual total per share and the average payment fell. That keeps the real ones and drops
            the artifacts — a monthly payer with 13 ex-dates in one calendar year, or a BDC paying more in total across extra supplementals.
          </Note>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, margin: "34px 0 14px" }}>Questions</h2>
        <Faq q="Do I need an account?">No. Nothing here is gated, and results live in the URL — copy the link to share a run.</Faq>
        <Faq q="Which tickers work?">
          US-listed stocks, ETFs and REITs. If a symbol has no dividend history, it still backtests — it just contributes price return only.
        </Faq>
        <Faq q="Why does my start date move?">
          The test needs every holding to have prices. Add a fund that launched in 2020 and the window starts in 2020, with a note saying so.
        </Faq>
        <Faq q="Are taxes and fees included?">
          No. Returns are gross: no withholding on dividends, no commissions, no fund fees beyond those already inside an ETF&apos;s price.
        </Faq>
        <Faq q="How far back can I go?">
          Ten years, which covers the history most dividend ETFs actually have.
        </Faq>
      </section>

      <footer
        style={{
          marginTop: "auto",
          borderTop: "1px solid var(--border)",
          padding: "16px clamp(20px, 5vw, 40px)",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          color: "var(--muted)",
          fontSize: 12,
        }}
      >
        <span style={{ flex: 1, minWidth: 240 }}>
          Past performance says nothing about the future. Research &amp; educational tool. Not investment advice.
        </span>
        <Link href="/" style={{ color: "var(--muted)" }}>
          sweetvaluelab.com
        </Link>
      </footer>
    </main>
  );
}

// ───────────────────────── local presentation bits ─────────────────────────

const panel: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--panel)",
  borderRadius: 14,
  padding: "18px clamp(14px, 3vw, 22px)",
  marginBottom: 16,
};

const input: React.CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--panel-2)",
  color: "var(--text)",
  fontSize: 14,
  fontFamily: "inherit",
};

const chip: React.CSSProperties = {
  height: 34,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontSize: 13,
  cursor: "pointer",
};

const primary: React.CSSProperties = {
  height: 38,
  padding: "0 22px",
  borderRadius: 999,
  border: "none",
  background: "var(--accent)",
  color: "#06223f",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 };
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: "0 0 6px" };
const sub: React.CSSProperties = { fontSize: 13, color: "var(--muted)", margin: "0 0 12px" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
      {label}
      {children}
    </label>
  );
}

function Kpi({ label, value, sub: subText, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone ? `var(--${tone})` : "var(--text)" }}>{value}</div>
      {subText && <div style={{ fontSize: 11, color: "var(--muted)" }}>{subText}</div>}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{ textAlign: align, padding: "6px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 500 }}>
      {children}
    </th>
  );
}

function Td({ children, align = "left", color }: { children: React.ReactNode; align?: "left" | "right"; color?: string }) {
  return <td style={{ textAlign: align, padding: "6px 8px", borderBottom: "1px solid var(--border)", color }}>{children}</td>;
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>{children}</p>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "14px 0" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{q}</div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>{children}</p>
    </div>
  );
}
