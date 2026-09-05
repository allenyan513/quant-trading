/**
 * Build-time render entry for the PUBLIC routes.
 *
 * Deliberately imports the two public pages directly instead of `src/routes.tsx`:
 * that module pulls in the whole workspace app (auth client, SWR polling, charts),
 * none of which can — or should — run in Node at build time.
 *
 * `renderToStaticMarkup`, not `renderToString`: the client re-renders from scratch
 * with `createRoot` (see `src/main.tsx`), so this markup exists purely for crawlers
 * and for first paint. Skipping hydration is intentional — the tool's default date
 * inputs are "today" and "ten years ago", which differ between build time and view
 * time and would mismatch on hydration.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import type { ComponentType } from "react";
import HomePage from "@/pages/page";
import DividendBacktestPage from "@/pages/tools/dividend-portfolio-backtest/page";
import AboutPage from "@/pages/about/page";
import PrivacyPage from "@/pages/privacy/page";
import TermsPage from "@/pages/terms/page";
import { PUBLIC_PAGES } from "@/lib/seo";

const COMPONENTS: Record<string, ComponentType> = {
  "/": HomePage,
  "/tools/dividend-portfolio-backtest": DividendBacktestPage,
  "/about": AboutPage,
  "/privacy": PrivacyPage,
  "/terms": TermsPage,
};

/** Render one public route to static HTML. Throws if a route has no component —
 *  that means PUBLIC_PAGES grew and this map didn't, which must fail the build. */
export function renderRoute(path: string): string {
  const Page = COMPONENTS[path];
  if (!Page) throw new Error(`prerender: no component registered for "${path}"`);
  return renderToStaticMarkup(
    <StaticRouter location={path}>
      <Page />
    </StaticRouter>,
  );
}

export { PUBLIC_PAGES };
