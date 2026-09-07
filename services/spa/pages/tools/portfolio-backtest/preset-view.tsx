/**
 * A ready-made backtest page — one per entry in `BACKTEST_PRESETS`.
 *
 * Takes the preset as a PROP rather than reading `useParams()`: the prerender
 * renders this component directly inside a StaticRouter with no <Routes>, so
 * `useParams()` would be empty at build time and every preset would prerender
 * blank. Prop in both places means the client route and the build render the
 * exact same thing.
 *
 * Layout order is deliberate: the editorial copy sits ABOVE the fold-level
 * results only in the sense that it survives them — the fetch happens on mount,
 * and if it fails (a cold marketdata cache can exceed the gateway's 10s timeout)
 * the visitor still lands on a page that answers their question.
 */
import { useEffect, useMemo } from "react";
import Link from "@/components/link";
import { PublicPage, PageSection } from "@/components/public-chrome";
import { BacktestResultsSection } from "@/components/backtest/results";
import { BacktestMethodNotes } from "@/components/backtest/method";
import { PresetSiblings } from "@/components/backtest/preset-links";
import { FaqList, panel, table, Th, Td } from "@/components/tool-ui";
import { ComparisonResultsSection } from "@/components/backtest/comparison";
import { useDividendBacktest, useDividendBacktests } from "@/lib/backtest";
import { presetRequest, presetRequestPerHolding, presetBenchmarkRequest, TOOL_PATH, type BacktestPreset } from "@/lib/backtest-presets";
import { applySeo, presetSeo } from "@/lib/seo";
import { PRESET_COPY } from "./presets";

export function PresetBacktestView({ preset }: { preset: BacktestPreset }) {
  const isComparison = preset.kind === "comparison";
  // retry once: on this page the fetch is unconditional, so a cold-cache timeout
  // is the first thing a search visitor sees. The failed attempt warms the cache.
  //
  // Both hooks are always called (hook order must not vary), but only the one
  // matching this page's shape is given a request; the other gets null and makes
  // no call. A comparison page runs one backtest PER FUND — a single blended
  // backtest would chart a 50/50 basket, which is not what "SCHD vs VYM" asks.
  const request = useMemo(() => (isComparison ? null : presetRequest(preset)), [preset, isComparison]);
  const requests = useMemo(() => (isComparison ? presetRequestPerHolding(preset) : null), [preset, isComparison]);
  // The S&P 500 backdrop. Its own leg, and deduped across pages by the request
  // cache in lib/backtest.ts — the same 10-year SPY run serves every page.
  const benchRequest = useMemo(() => presetBenchmarkRequest(preset), [preset]);
  const single = useDividendBacktest(request, { retry: 1 });
  const multi = useDividendBacktests(requests, { retry: 1 });
  const bench = useDividendBacktest(benchRequest, { retry: 1 });
  const Copy = PRESET_COPY[preset.slug];

  useEffect(() => applySeo(presetSeo(preset)), [preset]);

  // A comparison page no longer runs a blended basket, so it must not describe
  // itself as one — each fund gets the full amount, separately.
  const basket = isComparison
    ? `${preset.holdings.map((h) => h.symbol).join(" vs ")} · $${preset.initial.toLocaleString("en-US")} in each`
    : preset.holdings.map((h) => `${h.symbol} ${h.weight}%`).join(" · ");

  return (
    <PublicPage>

      <PageSection pad="top">
        <nav style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          <Link href={TOOL_PATH} style={{ color: "var(--muted)" }}>
            Dividend Portfolio Backtest
          </Link>
          <span> / {preset.linkLabel}</span>
        </nav>
        <h1 style={{ fontSize: "var(--fs-h1)", fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>
          {preset.h1}
        </h1>
        <p style={{ fontSize: "var(--fs-lead)", color: "var(--muted)", lineHeight: 1.55, margin: "12px 0 0", maxWidth: "var(--w-measure)" }}>
          {preset.intro}
        </p>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "14px 0 0" }}>
          {basket} · {preset.years} years ·{" "}
          {isComparison ? "dividends reinvested" : `$${preset.initial.toLocaleString("en-US")} · ${preset.reinvest ? "dividends reinvested" : "dividends as cash"}`}
        </p>
      </PageSection>

      {/* Fund facts FIRST. This block is fully static, so it is what a non-JS
          crawler (and the first paint) actually sees — the page opens with a real
          side-by-side answer instead of an empty slot while the backtest loads. */}
      {preset.facts && preset.facts.length > 0 && (
        <PageSection pad="body" style={{ paddingBottom: 0 }}>
          <div style={panel}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px" }}>
              {preset.holdings.map((h) => h.symbol).join(" vs ")} at a glance
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ ...table, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "22%" }} />
                  {preset.holdings.map((h) => (
                    <col key={h.symbol} style={{ width: `${78 / preset.holdings.length}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <Th>&nbsp;</Th>
                    {preset.holdings.map((h) => (
                      <Th key={h.symbol}>{h.symbol}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preset.facts.map((f) => (
                    <tr key={f.label}>
                      <Td color="var(--muted)">{f.label}</Td>
                      {f.values.map((v, i) => (
                        <Td key={i}>{v}</Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
              Fund facts as of {preset.updated}. Holdings counts change at each index rebalance.
            </p>
          </div>
        </PageSection>
      )}

      <PageSection pad="flush">
        {isComparison ? (
          <ComparisonResultsSection
            symbols={preset.holdings.map((h) => h.symbol)}
            results={multi.results}
            initial={preset.initial}
            benchmark={bench.result}
            loading={multi.loading}
            error={multi.error}
          />
        ) : (
          <BacktestResultsSection result={single.result} benchmark={bench.result} loading={single.loading} error={single.error} />
        )}
      </PageSection>

      {/* Same 1040 container as the H1 and the results above, with the prose column
          pinned to its LEFT edge (margin-right auto, not `0 auto`). Centering a
          narrower article inside a wider page steps the copy ~140px to the right of
          everything above it, which reads as a layout bug even though the measure
          itself is right. Keep the ~70-character line length; align the left edge. */}
      <PageSection pad="body" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <article style={{ maxWidth: "var(--w-measure)", marginRight: "auto" }}>
          {Copy && <Copy />}

          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, margin: "34px 0 14px" }}>How this backtest works</h2>
          <BacktestMethodNotes variant="brief" />

          <h2 style={{ fontSize: "var(--fs-h2)", fontWeight: 800, letterSpacing: -0.3, margin: "34px 0 6px" }}>Questions</h2>
          <FaqList items={preset.faq} />
        </article>

        {/* Cards, not prose — they get the full content width. */}
        <PresetSiblings current={preset.slug} />

        <p style={{ fontSize: 12, color: "var(--muted)", margin: "28px 0 40px" }}>
          Last updated <time dateTime={preset.updated}>{preset.updated}</time>
        </p>
      </PageSection>

    </PublicPage>
  );
}
