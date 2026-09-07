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
import DividendBacktestPage from "@/pages/tools/portfolio-backtest/page";
import AboutPage from "@/pages/about/page";
import PrivacyPage from "@/pages/privacy/page";
import TermsPage from "@/pages/terms/page";
import { PUBLIC_PAGES } from "@/lib/seo";
import { PresetBacktestView } from "@/pages/tools/portfolio-backtest/preset-view";
import { BACKTEST_PRESETS, presetPath, assertPresetGraph, TOOL_PATH } from "@/lib/backtest-presets";
import ToolsIndexPage from "@/pages/tools/page";
import FireCalculatorPage from "@/pages/tools/fire-calculator/page";
import { assertToolGraph, FIRE_TOOL_PATH, TOOLS_PATH } from "@/lib/tools";
import BlogIndexPage from "@/pages/blog/page";
import { BlogPostView } from "@/pages/blog/post-view";
import { assertBlogGraph, assertBlogLinks, BLOG_LANGS, BLOG_POSTS, langPrefix } from "@/lib/blog";
import { BLOG_FEEDS } from "@/lib/seo";

// A malformed preset registry (duplicate slug, dangling `related`, empty FAQ) must
// fail the BUILD rather than ship a dead internal link. Same for the tool registry
// behind `/tools`, whose entire purpose is to be a page full of working links.
assertPresetGraph();
assertToolGraph();
// Same contract for the blog: a malformed post (bad slug, missing title, HTML in
// the body, a date that is not a date) fails the build. `assertBlogLinks` then
// checks every site-internal link in every post against the routes actually being
// emitted — prose is where dead internal links come from, and a 404 in a post is
// as expensive as one on the tool hub.
assertBlogGraph();
assertBlogLinks(new Set(PUBLIC_PAGES.map((p) => p.path)));

const COMPONENTS: Record<string, ComponentType> = {
  "/": HomePage,
  [TOOLS_PATH]: ToolsIndexPage,
  [TOOL_PATH]: DividendBacktestPage,
  [FIRE_TOOL_PATH]: FireCalculatorPage,
  "/about": AboutPage,
  "/privacy": PrivacyPage,
  "/terms": TermsPage,
  // Same component, same prop as the client route — the preset is passed in, never
  // read from `useParams()`, which is empty under StaticRouter and would prerender
  // every preset page blank.
  ...Object.fromEntries(BACKTEST_PRESETS.map((p) => [presetPath(p), () => <PresetBacktestView preset={p} />])),
  ...Object.fromEntries(BLOG_LANGS.map((lang) => [langPrefix(lang), () => <BlogIndexPage lang={lang} />])),
  ...Object.fromEntries(BLOG_POSTS.map((post) => [post.path, () => <BlogPostView post={post} />])),
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

export { PUBLIC_PAGES, BLOG_FEEDS };
