/**
 * Internal links for the preset pages — the crawl path.
 *
 * A prerendered page nobody links to is a page a crawler never discovers, so
 * these two lists are what make the whole preset scheme work: the tool page is
 * the hub, each preset links its siblings and back to the hub.
 *
 * Both render from `BACKTEST_PRESETS`, so adding a preset cannot leave a link
 * list behind. Links are BARE PATHS on purpose — never `?p=…` deep links, which
 * would invite indexing of near-duplicate query-string URLs (the exact thing the
 * preset pages exist to replace).
 */
import Link from "@/components/link";
import { BACKTEST_PRESETS, presetPath, TOOL_PATH } from "@/lib/backtest-presets";

function LinkCard({ href, label, blurb }: { href: string; label: string; blurb: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "14px 16px",
        color: "var(--text)",
        textDecoration: "none",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{blurb}</div>
    </Link>
  );
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 } as const;

/** On the tool page: the hub every preset is reachable from. */
export function PresetHub() {
  return (
    <section style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "8px clamp(16px, 5vw, 40px) 0" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, margin: "0 0 6px" }}>Ready-made backtests</h2>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 14px" }}>
        Common baskets and comparisons, already set up — open one and the numbers are there.
      </p>
      <div style={grid}>
        {BACKTEST_PRESETS.map((p) => (
          <LinkCard key={p.slug} href={presetPath(p)} label={p.linkLabel} blurb={p.linkBlurb} />
        ))}
      </div>
    </section>
  );
}

/** On a preset page: its siblings, plus the way back to the full tool. */
export function PresetSiblings({ current }: { current: string }) {
  const preset = BACKTEST_PRESETS.find((p) => p.slug === current);
  const siblings = (preset?.related ?? []).map((s) => BACKTEST_PRESETS.find((p) => p.slug === s)).filter(Boolean);
  return (
    <section style={{ marginTop: 34 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, margin: "0 0 14px" }}>Related backtests</h2>
      <div style={grid}>
        {siblings.map((p) => (
          <LinkCard key={p!.slug} href={presetPath(p!)} label={p!.linkLabel} blurb={p!.linkBlurb} />
        ))}
        <LinkCard
          href={TOOL_PATH}
          label="Build your own"
          blurb="Any tickers, any weights, any window up to twenty years."
        />
      </div>
    </section>
  );
}
