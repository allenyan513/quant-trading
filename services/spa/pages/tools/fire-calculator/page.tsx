/**
 * FIRE calculator — public, no sign-up, and entirely client-side arithmetic.
 *
 * Ported from the standalone tool in the value-scope repo. The simulation itself
 * moved to `@qt/shared/fire` (pure, unit-tested); everything here is the surface.
 *
 * TWO THINGS SHAPE THIS FILE, both about the build-time prerender:
 *
 * 1. `useMemo` runs during render, `useEffect` does not. So `simulateDet` — the
 *    "expected case" — lands in `dist/tools/fire-calculator.html` and is what a
 *    crawler (and anyone on a slow connection) actually reads. Everything the
 *    Monte Carlo produces arrives only in the browser. The page therefore has to
 *    mean something with the deterministic answer alone, which is why the prose,
 *    the method notes and the FAQ are static and the charts are not load-bearing.
 *
 * 2. `useSearchParams` is empty under StaticRouter, and `inputsFromParams` maps
 *    that to `DEFAULTS` — so the prerendered page is the default run, not a blank
 *    form. `useParams` is banned outright (no route match exists at build time).
 *
 * There is no API call anywhere on this page. An anonymous landing costs nothing.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageSection, PublicPage, pageTitleStyle } from "@/components/public-chrome";
import { FanChartLazy, YearsHistogramLazy } from "@/components/fire/fire-charts.lazy";
import { FaqList, Field, Note, h2Style, input, panel, subStyle } from "@/components/tool-ui";
import { FIRE_FAQ, FIRE_TOOL_SEO, applySeo } from "@/lib/seo";
import {
  BOUNDS,
  DEFAULTS,
  type FireInputs,
  fmtMoney,
  fmtMoneyShort,
  fmtRate,
  inputsFromParams,
  paramsFromInputs,
} from "@/lib/fire";
import {
  histogram,
  runMC,
  runWithdrawalMC,
  simulateDet,
  type MCResult,
  type WithdrawalResult,
} from "@qt/shared/fire";

/** Paths per run, and the horizon past which "you don't get there" is the answer. */
const N_SIMS = 1000;
const MAX_YEARS = 60;
/** Retirement length the withdrawal phase is tested over — the Trinity Study's. */
const WITHDRAWAL_YEARS = 30;
/** Long enough that dragging a slider doesn't queue 40 runs, short enough that
 *  releasing it feels like the answer was already there. */
const DEBOUNCE_MS = 350;

const lead: React.CSSProperties = {
  fontSize: "var(--fs-lead)",
  color: "var(--muted)",
  lineHeight: 1.6,
  maxWidth: "var(--w-measure)",
  margin: "10px 0 0",
};

const bigNum: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 300,
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
};

const kicker: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--muted)",
  margin: "0 0 10px",
};

const caption: React.CSSProperties = { fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6 };

/** Money input. Text rather than `type="number"` so it can carry thousands
 *  separators — the figures here are six and seven digits, and `1000000` is
 *  genuinely hard to read back. */
function MoneyField({
  label,
  value,
  onChange,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div>
      <Field label={label}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--muted)", fontSize: 14 }}>$</span>
          <input
            type="text"
            inputMode="numeric"
            value={value === 0 ? "" : value.toLocaleString()}
            placeholder="0"
            aria-label={label}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d]/g, "");
              onChange(raw === "" ? 0 : Number.parseInt(raw, 10));
            }}
            style={{ ...input, flex: 1, minWidth: 0, fontVariantNumeric: "tabular-nums" }}
          />
          {suffix && <span style={{ color: "var(--muted)", fontSize: 13 }}>{suffix}</span>}
        </div>
      </Field>
      {hint && <div style={{ ...caption, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

function RateSlider({
  label,
  value,
  bounds,
  onChange,
}: {
  label: string;
  value: number;
  bounds: { min: number; max: number; step: number };
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)" }}>
        <span>{label}</span>
        <span style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{fmtRate(value)}</span>
      </div>
      <input
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", marginTop: 6, accentColor: "var(--accent)" }}
      />
    </div>
  );
}

export default function FireCalculatorPage() {
  const [params, setParams] = useSearchParams();

  /** The query string IS the state — no second copy to drift out of sync, and a
   *  reload or a shared link reproduces the run exactly. */
  const query = params.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inputs = useMemo(() => inputsFromParams(params), [query]);

  /** Only ever called from an input handler, which is why a visitor who changes
   *  nothing keeps a clean, parameter-free URL. `replace` so dragging a slider
   *  doesn't bury the back button under 40 history entries. */
  const set = (patch: Partial<FireInputs>) =>
    setParams(paramsFromInputs({ ...inputs, ...patch }), { replace: true });

  const [showAssumptions, setShowAssumptions] = useState(false);

  /** Runs during render — so these numbers are in the prerendered HTML. */
  const det = useMemo(
    () => simulateDet(inputs.p0, inputs.monthly, inputs.spend, inputs.mu, inputs.swr, inputs.inflation),
    [inputs],
  );

  const [mc, setMc] = useState<MCResult | null>(null);
  const [mcLoading, setMcLoading] = useState(false);
  const [withdrawal, setWithdrawal] = useState<WithdrawalResult | null>(null);

  useEffect(() => {
    setMcLoading(true);
    const timer = setTimeout(() => {
      const res = runMC(
        inputs.p0,
        inputs.monthly,
        inputs.spend,
        inputs.mu,
        inputs.sigma,
        inputs.swr,
        inputs.inflation,
        N_SIMS,
        MAX_YEARS,
      );
      setMc(res);

      // The withdrawal phase asks "having got there, does it last?" — a question
      // that means nothing when most paths never get there in the first place.
      if (res.successRate > 0.5 && det.reached && det.finalBalance != null && det.finalMonthlyNominal != null) {
        setWithdrawal(
          runWithdrawalMC(
            det.finalBalance,
            det.finalMonthlyNominal * 12,
            inputs.mu,
            inputs.sigma,
            inputs.inflation,
            N_SIMS,
            WITHDRAWAL_YEARS,
          ),
        );
      } else {
        setWithdrawal(null);
      }
      setMcLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputs, det.reached, det.finalBalance, det.finalMonthlyNominal]);

  const hist = useMemo(() => (mc ? histogram(mc.yearsToFI, 18) : []), [mc]);

  /** Which histogram bar the deterministic case falls in, so it can be coloured
   *  rather than only marked with a line. */
  const markerBin = useMemo(() => {
    if (!mc || !det.reached || det.years == null || hist.length === 0) return null;
    const width = (hist[1]?.binStart ?? 0) - (hist[0]?.binStart ?? 0) || 1;
    const years = det.years;
    const idx = hist.findIndex((b) => years >= b.binStart && years < b.binStart + width);
    return idx >= 0 ? idx : null;
  }, [mc, det, hist]);

  /** Past P90 the fan is a flat line of outliers that squashes everything worth
   *  looking at into the left third. */
  const fan = useMemo(() => {
    const all = mc?.fanData ?? [];
    return all.slice(0, Math.min(all.length, Math.ceil((mc?.p90 ?? 50) + 5)));
  }, [mc]);

  useEffect(() => applySeo(FIRE_TOOL_SEO), []);

  const fiTarget = inputs.spend * 12 * det.fiMult;

  return (
    <PublicPage>
      <PageSection pad="top">
        <h1 style={pageTitleStyle}>FIRE Calculator</h1>
        <p style={lead}>
          How long until work is optional? This runs your savings plan through {N_SIMS.toLocaleString()} Monte Carlo
          paths and shows the whole distribution of years to financial independence — not the single average number
          every other calculator stops at. Free, no sign-up, nothing leaves your browser.
        </p>
      </PageSection>

      <PageSection pad="body">
        <div style={panel}>
          <h2 style={h2Style}>Your inputs</h2>
          <p style={subStyle}>Three numbers decide almost everything. The assumptions below are secondary.</p>
          <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            <MoneyField
              label="Invested today"
              value={inputs.p0}
              onChange={(p0) => set({ p0 })}
              hint="What you already hold, as a lump sum."
            />
            <MoneyField
              label="Monthly contribution"
              value={inputs.monthly}
              onChange={(monthly) => set({ monthly })}
              suffix="/ mo"
              hint="Held flat in nominal dollars — no raises assumed."
            />
            <MoneyField
              label="Target monthly spend"
              value={inputs.spend}
              onChange={(spend) => set({ spend })}
              suffix="/ mo"
              hint="In today's money. The simulation inflates it for you."
            />
          </div>

          <div style={{ borderTop: "1px solid var(--border)", marginTop: 18, paddingTop: 14 }}>
            <button
              type="button"
              onClick={() => setShowAssumptions((v) => !v)}
              aria-expanded={showAssumptions}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                width: "100%",
                background: "transparent",
                border: "none",
                padding: 0,
                color: "var(--text)",
                font: "inherit",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span>{showAssumptions ? "▾" : "▸"} Market assumptions</span>
              <span style={{ color: "var(--muted)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                μ {fmtRate(inputs.mu)} · σ {fmtRate(inputs.sigma)} · SWR {fmtRate(inputs.swr)} · π{" "}
                {fmtRate(inputs.inflation)}
              </span>
            </button>

            {showAssumptions && (
              <div
                style={{
                  display: "grid",
                  gap: 18,
                  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                  marginTop: 16,
                }}
              >
                <RateSlider
                  label="Annual mean return (μ)"
                  value={inputs.mu}
                  bounds={BOUNDS.mu}
                  onChange={(mu) => set({ mu })}
                />
                <RateSlider
                  label="Annual volatility (σ)"
                  value={inputs.sigma}
                  bounds={BOUNDS.sigma}
                  onChange={(sigma) => set({ sigma })}
                />
                <RateSlider
                  label="Safe withdrawal rate"
                  value={inputs.swr}
                  bounds={BOUNDS.swr}
                  onChange={(swr) => set({ swr })}
                />
                <RateSlider
                  label="Annual inflation (π)"
                  value={inputs.inflation}
                  bounds={BOUNDS.inflation}
                  onChange={(inflation) => set({ inflation })}
                />
              </div>
            )}
            {showAssumptions && (
              <p style={{ ...caption, marginTop: 14, marginBottom: 0 }}>
                Defaults are the S&amp;P 500&apos;s long-run shape — roughly 10% mean return and 16% volatility since
                1928 — with the 4% rule and 3% inflation.
              </p>
            )}
          </div>
        </div>
      </PageSection>

      <PageSection pad="flush">
        {/* Deterministic + Monte Carlo, side by side. The left half renders at
            build time; the right half only ever appears in a browser. */}
        <div style={panel}>
          <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <div>
              <p style={kicker}>Expected case · constant {fmtRate(inputs.mu)} return</p>
              {det.reached ? (
                <>
                  <div style={bigNum}>
                    {det.years === 0 ? "Already there" : det.years!.toFixed(1)}
                    {det.years !== 0 && (
                      <span style={{ fontSize: 15, color: "var(--muted)", marginLeft: 6 }}>years</span>
                    )}
                  </div>
                  <p style={{ ...caption, marginTop: 10, marginBottom: 0 }}>
                    You need <strong style={{ color: "var(--text)" }}>{fmtMoney(fiTarget)}</strong> in today&apos;s
                    money — {det.fiMult.toFixed(0)}× a year of spending at a {fmtRate(inputs.swr)} withdrawal rate.
                    {det.finalBalance != null &&
                      det.years !== 0 &&
                      ` Getting there means a balance of about ${fmtMoneyShort(det.finalBalance)} in the dollars of that year.`}
                  </p>
                </>
              ) : (
                <>
                  <div style={{ ...bigNum, color: "var(--down)" }}>Out of reach</div>
                  <p style={{ ...caption, marginTop: 10, marginBottom: 0 }}>
                    At this contribution rate the target — {fmtMoney(fiTarget)}, growing with inflation — is never
                    caught within 80 years. Raise the monthly contribution or lower the target spend.
                  </p>
                </>
              )}
            </div>

            <div>
              <p style={kicker}>
                Monte Carlo · {N_SIMS.toLocaleString()} random paths
                {mcLoading && <span style={{ color: "var(--muted)" }}> · computing…</span>}
              </p>
              {mc && mc.p10 != null && mc.p50 != null && mc.p90 != null ? (
                <>
                  <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                    {(
                      [
                        ["Lucky P10", mc.p10, "var(--up)"],
                        ["Median P50", mc.p50, "var(--text)"],
                        ["Unlucky P90", mc.p90, "var(--down)"],
                      ] as const
                    ).map(([label, value, color]) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                          {label}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 400, color, fontVariantNumeric: "tabular-nums" }}>
                          {value.toFixed(1)}
                          <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>yrs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p style={{ ...caption, marginTop: 12, marginBottom: 0 }}>
                    P10–P90 spread{" "}
                    <strong style={{ color: "var(--text)" }}>{(mc.p90 - mc.p10).toFixed(1)} yrs</strong> · success rate{" "}
                    <strong style={{ color: "var(--text)" }}>{(mc.successRate * 100).toFixed(1)}%</strong>
                    {mc.failures > 0 &&
                      ` (${mc.failures} of ${mc.nSims} paths never reached FI within ${MAX_YEARS} years)`}
                  </p>
                </>
              ) : (
                <p style={{ ...caption, margin: 0 }}>
                  {mcLoading ? `Running ${N_SIMS.toLocaleString()} simulations…` : "Simulating in your browser…"}
                </p>
              )}
            </div>
          </div>
        </div>

        {mc && mc.successRate > 0.5 && fan.length > 0 && (
          <div style={panel}>
            <h2 style={h2Style}>The shape of the uncertainty</h2>
            <p style={subStyle}>Where the balance lands each year, across every simulated path.</p>
            <FanChartLazy data={fan} fiMult={det.fiMult} />
          </div>
        )}

        {mc && hist.length > 0 && (
          <div style={panel}>
            <h2 style={h2Style}>Years to FI, as a distribution</h2>
            <p style={subStyle}>How often each outcome came up across {N_SIMS.toLocaleString()} paths.</p>
            <YearsHistogramLazy
              data={hist}
              markerYears={det.reached && det.years != null ? det.years : null}
              markerBin={markerBin}
            />
          </div>
        )}

        {withdrawal && (
          <div style={panel}>
            <h2 style={h2Style}>Sequence-of-returns risk</h2>
            <p style={subStyle}>
              Having got there — does the money survive {WITHDRAWAL_YEARS} years of withdrawals?
            </p>
            {(() => {
              const tone =
                withdrawal.successRate >= 0.9
                  ? "var(--up)"
                  : withdrawal.successRate >= 0.75
                    ? "var(--warn)"
                    : "var(--down)";
              return (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 20, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ ...bigNum, color: tone }}>
                        {(withdrawal.successRate * 100).toFixed(1)}
                        <span style={{ fontSize: 16, color: "var(--muted)" }}>%</span>
                      </div>
                      <div style={{ ...caption, marginTop: 6 }}>{WITHDRAWAL_YEARS}-year success rate</div>
                    </div>
                    <p style={{ ...caption, flex: 1, minWidth: 220, margin: 0 }}>
                      Assumes you stop working the moment the expected case reaches FI, with a balance around{" "}
                      {fmtMoneyShort(det.finalBalance)}, then withdraw the inflation-adjusted equivalent every year
                      while returns keep arriving at random.{" "}
                      <strong style={{ color: "var(--text)" }}>{(withdrawal.bustRate * 100).toFixed(1)}%</strong> of
                      paths run out of money before the horizon.
                    </p>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: "var(--panel-2)",
                      overflow: "hidden",
                      marginTop: 14,
                    }}
                  >
                    <div style={{ height: "100%", width: `${withdrawal.successRate * 100}%`, background: tone }} />
                  </div>
                  <p style={{ ...caption, marginTop: 14, marginBottom: 0, fontStyle: "italic" }}>
                    The Trinity Study put the 4% rule&apos;s historical 30-year success rate near 95%. A Monte Carlo
                    like this one usually prints a little lower, because it draws every year independently while real
                    history mean-reverts — which quietly favours anyone holding for a long time.
                  </p>
                </>
              );
            })()}
          </div>
        )}

        {mc && det.reached && det.years != null && mc.p10 != null && mc.p50 != null && mc.p90 != null && (
          <p
            style={{
              borderLeft: "3px solid var(--warn)",
              padding: "4px 0 4px 16px",
              margin: "0 0 16px",
              fontSize: 14,
              lineHeight: 1.7,
              fontStyle: "italic",
            }}
          >
            The expected case says <strong>{det.years.toFixed(1)} years</strong>. The simulations say something more
            useful: a <strong>1-in-10 chance of getting there in {mc.p10.toFixed(0)}</strong>, and a{" "}
            <strong>1-in-10 chance of still waiting at {mc.p90.toFixed(0)}</strong>. That{" "}
            {(mc.p90 - mc.p10).toFixed(0)}-year spread is what markets actually look like. Plan around the median,
            and make sure the P75 case is one you could live with.
          </p>
        )}
      </PageSection>

      <PageSection pad="bottom">
        <h2 style={{ fontSize: "var(--fs-h2)", fontWeight: 700, margin: "0 0 14px" }}>How this works</h2>
        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <Note title="Two answers, not one">
            The expected case compounds at a fixed return, the way most calculators work. The Monte Carlo runs{" "}
            {N_SIMS.toLocaleString()} paths that sample each month&apos;s return at random around the same average.
            The gap between them is the point of the page.
          </Note>
          <Note title="What the target means">
            Financial independence here is your target spend times twelve, divided by the withdrawal rate — 25× a
            year of spending at 4%. The target is stated in today&apos;s money and grows with inflation inside the
            simulation, so it keeps its purchasing power.
          </Note>
          <Note title="What it leaves out">
            No taxes, no fees, no Social Security or pension, no salary growth, and no mean reversion. Returns are
            drawn independently each month, which is harsher than history has actually been over long horizons.
          </Note>
          <Note title="Why the numbers move">
            Every input change reruns the simulation, and random sampling means the figures wobble by a few percent
            between runs. Read the shape, not the last decimal. Nothing you type is sent anywhere — the whole
            calculation happens in your browser.
          </Note>
        </div>

        <h2 style={{ fontSize: "var(--fs-h2)", fontWeight: 700, margin: "28px 0 6px" }}>Questions</h2>
        <FaqList items={FIRE_FAQ} />

        <p style={{ ...caption, marginTop: 24 }}>
          For personal planning and education only. This is not investment advice, and it is not a forecast.
        </p>
      </PageSection>
    </PublicPage>
  );
}
