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
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { BacktestResultsSection } from "@/components/backtest/results";
import { BacktestMethodNotes } from "@/components/backtest/method";
import { PresetSiblings } from "@/components/backtest/preset-links";
import { FaqList, panel, table, Th, Td } from "@/components/backtest/ui";
import { useDividendBacktest } from "@/lib/backtest";
import { presetRequest, TOOL_PATH, type BacktestPreset } from "@/lib/backtest-presets";
import { applySeo, presetSeo } from "@/lib/seo";
import { PRESET_COPY } from "./presets";

export function PresetBacktestView({ preset }: { preset: BacktestPreset }) {
  const request = useMemo(() => presetRequest(preset), [preset]);
  // retry once: on this page the fetch is unconditional, so a cold-cache timeout
  // is the first thing a search visitor sees. The failed attempt warms the cache.
  const { result, error, loading } = useDividendBacktest(request, { retry: 1 });
  const Copy = PRESET_COPY[preset.slug];

  useEffect(() => applySeo(presetSeo(preset)), [preset]);

  const basket = preset.holdings.map((h) => `${h.symbol} ${h.weight}%`).join(" · ");

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PublicHeader />

      <section style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "clamp(16px, 4vw, 40px) clamp(16px, 5vw, 40px) 8px" }}>
        <nav style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          <Link href={TOOL_PATH} style={{ color: "var(--muted)" }}>
            Dividend Portfolio Backtest
          </Link>
          <span> / {preset.linkLabel}</span>
        </nav>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>
          {preset.h1}
        </h1>
        <p style={{ fontSize: "clamp(15px, 2vw, 18px)", color: "var(--muted)", lineHeight: 1.55, margin: "12px 0 0", maxWidth: 680 }}>
          {preset.intro}
        </p>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "14px 0 0" }}>
          {basket} · {preset.years} years · ${preset.initial.toLocaleString("en-US")} ·{" "}
          {preset.reinvest ? "dividends reinvested" : "dividends as cash"}
        </p>
      </section>

      {/* Fund facts FIRST. This block is fully static, so it is what a non-JS
          crawler (and the first paint) actually sees — the page opens with a real
          side-by-side answer instead of an empty slot while the backtest loads. */}
      {preset.facts && preset.facts.length > 0 && (
        <section style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "16px clamp(16px, 5vw, 40px) 0" }}>
          <div style={panel}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px" }}>
              {preset.holdings.map((h) => h.symbol).join(" vs ")} at a glance
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
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
        </section>
      )}

      <section style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "0 clamp(16px, 5vw, 40px)" }}>
        <BacktestResultsSection result={result} loading={loading} error={error} />
      </section>

      {/* Same 1040 container as the H1 and the results above, with the prose column
          pinned to its LEFT edge (margin-right auto, not `0 auto`). Centering a
          narrower article inside a wider page steps the copy ~140px to the right of
          everything above it, which reads as a layout bug even though the measure
          itself is right. Keep the ~70-character line length; align the left edge. */}
      <section style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "8px clamp(16px, 5vw, 40px) 8px" }}>
        <article style={{ maxWidth: 720, marginRight: "auto" }}>
          {Copy && <Copy />}

          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, margin: "34px 0 14px" }}>How this backtest works</h2>
          <BacktestMethodNotes variant="brief" />

          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, margin: "34px 0 6px" }}>Questions</h2>
          <FaqList items={preset.faq} />
        </article>

        {/* Cards, not prose — they get the full content width. */}
        <PresetSiblings current={preset.slug} />

        <p style={{ fontSize: 12, color: "var(--muted)", margin: "28px 0 40px" }}>
          Last updated <time dateTime={preset.updated}>{preset.updated}</time>
        </p>
      </section>

      <PublicFooter />
    </main>
  );
}
