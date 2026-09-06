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
import { PageSection } from "@/components/public-chrome";
import { BACKTEST_PRESETS, PRESET_CATEGORIES, presetPath, TOOL_PATH } from "@/lib/backtest-presets";

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

/**
 * On the tool page: the hub every preset is reachable from.
 *
 * Grouped by category rather than listed flat. Someone who arrived on "what would
 * NVDA have done" and someone who arrived on "SCHD vs VYM" want different shelves,
 * and one undifferentiated list makes both read the whole thing to find their half.
 * Shelves render from `PRESET_CATEGORIES`, so a new category appears here the
 * moment it exists — and an empty one simply doesn't render.
 */
export function PresetHub() {
  return (
    <PageSection pad="flush" style={{ paddingTop: 8 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, margin: "0 0 6px" }}>Ready-made backtests</h2>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 4px" }}>
        Common baskets and comparisons, already set up — open one and the numbers are there.
      </p>
      {PRESET_CATEGORIES.map((cat) => {
        const inCategory = BACKTEST_PRESETS.filter((p) => p.category === cat.id);
        if (inCategory.length === 0) return null;
        return (
          <div key={cat.id} style={{ marginTop: 22 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.1, margin: "0 0 2px" }}>{cat.label}</h3>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px" }}>{cat.blurb}</p>
            <div style={grid}>
              {inCategory.map((p) => (
                <LinkCard key={p.slug} href={presetPath(p)} label={p.linkLabel} blurb={p.linkBlurb} />
              ))}
            </div>
          </div>
        );
      })}
    </PageSection>
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
