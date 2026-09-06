/**
 * The tool registry — every free, no-sign-up tool on the public surface.
 *
 * This exists so that `/tools` is generated, never hand-maintained. A hub page
 * whose list is typed out by hand goes stale the first time someone ships a tool
 * and forgets it, and a tool missing from the hub is a tool with no internal link
 * pointing at it — which, for a crawler, is a tool that does not exist.
 *
 * SINGLE SOURCE feeding three consumers, so none of them can drift: the hub page
 * (`pages/tools/page.tsx`), `TOOLS_SEO`'s `ItemList` (`lib/seo.ts`), and the
 * public footer's link (`components/public-chrome.tsx`).
 *
 * ADDING A TOOL: append an entry here, then do what every public page needs —
 * a route in `src/routes.tsx`, a `PageSeo` in `PUBLIC_PAGES`, and a component in
 * the prerender's `COMPONENTS` map. `assertToolGraph()` runs at build time and
 * fails the build on a malformed entry rather than shipping a dead link.
 *
 * Pure data — no JSX, so the prerender and the sitemap can read it in Node.
 */
import { BACKTEST_PRESETS, presetPath, TOOL_PATH } from "@/lib/backtest-presets";

export const TOOLS_PATH = "/tools";

/** A ready-made page belonging to a tool — its own crawlable URL. */
export interface ToolLink {
  readonly path: string;
  readonly label: string;
}

export interface Tool {
  /** Canonical path. Must live under `/tools/` so the hub is a real parent. */
  readonly path: string;
  /** Link text and the page's own H2. Keep it a plain noun phrase. */
  readonly name: string;
  /** One sentence, in the reader's terms: what it answers, not how it works. */
  readonly blurb: string;
  /** Ready-made runs of this tool, listed under it so the hub reaches every leaf
   *  page in one hop. Optional — a tool with no preset pages simply omits it. */
  readonly pages?: readonly ToolLink[];
}

export const TOOLS: readonly Tool[] = [
  {
    path: TOOL_PATH,
    name: "Portfolio Backtest",
    blurb:
      "Put a basket of stocks or ETFs through up to twenty years of daily prices: total return, CAGR, drawdown, and what the dividends did — reinvested or taken as cash.",
    // Derived, not restated: the preset registry already IS the list, and copying
    // it here is the drift this file exists to prevent.
    pages: BACKTEST_PRESETS.map((p) => ({ path: presetPath(p), label: p.linkLabel })),
  },
];

/**
 * Build-time integrity check, in the spirit of `assertPresetGraph()`: the cost of
 * a bad entry is a broken link on the page that exists to be crawled, so it fails
 * the build instead.
 */
export function assertToolGraph(): void {
  const seen = new Set<string>();
  for (const t of TOOLS) {
    if (!t.path.startsWith(`${TOOLS_PATH}/`)) {
      throw new Error(`tools: "${t.name}" has path "${t.path}", which is not under ${TOOLS_PATH}/`);
    }
    if (seen.has(t.path)) throw new Error(`tools: duplicate path "${t.path}"`);
    seen.add(t.path);
    if (!t.name.trim() || !t.blurb.trim()) throw new Error(`tools: "${t.path}" is missing a name or blurb`);
    for (const p of t.pages ?? []) {
      if (!p.path.startsWith(`${t.path}/`)) {
        throw new Error(`tools: "${p.label}" (${p.path}) is listed under "${t.path}" but is not beneath it`);
      }
    }
  }
}
