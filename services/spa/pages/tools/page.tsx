/**
 * `/tools` — the hub for every free tool, and the crawl path into all of them.
 *
 * Its whole job is internal linking. A prerendered page nobody links to is a page
 * a crawler never discovers, so this page plus the footer link that points here
 * are what make each tool (and each ready-made run beneath it) reachable in one
 * or two hops from anywhere on the public surface.
 *
 * Every tool name is a real `<a href>` inside its heading, not a button or an
 * onClick — a crawler follows anchors and nothing else. The list renders from
 * `TOOLS`, so shipping a tool adds it here automatically.
 *
 * Static and prerendered like the rest of the public surface: no session check,
 * no fetch.
 */
import { useEffect } from "react";
import Link from "@/components/link";
import { PublicPage, PageSection, pageTitleStyle } from "@/components/public-chrome";
import { applySeo, TOOLS_SEO } from "@/lib/seo";
import { TOOLS, type Tool } from "@/lib/tools";

export default function ToolsIndexPage() {
  useEffect(() => applySeo(TOOLS_SEO), []);

  return (
    <PublicPage>
      <PageSection pad="page">
        <h1 style={pageTitleStyle}>Tools</h1>
        {/* Body copy is capped at the reading measure even though the page is a
            tier wider — the hub used to run past 100 characters a line. */}
        <p style={{ fontSize: "var(--fs-lead)", lineHeight: 1.65, color: "var(--muted)", margin: "14px 0 0", maxWidth: "var(--w-measure)" }}>
          Free and open to everyone — no account, no sign-up, no trial. Each one computes from primary market data rather than
          summarizing someone&rsquo;s opinion, and shows the numbers it used.
        </p>

        {TOOLS.map((tool) => (
          <ToolEntry key={tool.path} tool={tool} />
        ))}
      </PageSection>
    </PublicPage>
  );
}

function ToolEntry({ tool }: { tool: Tool }) {
  return (
    <section style={{ marginTop: 34, borderTop: "1px solid var(--border)", paddingTop: 22 }}>
      {/* The heading IS the link: one anchor per tool, with the tool's name as its
          text, is what a crawler reads as the site's structure. */}
      <h2 style={{ fontSize: "var(--fs-h2)", fontWeight: 800, letterSpacing: -0.3, margin: 0 }}>
        <Link href={tool.path} style={{ color: "var(--accent)" }}>
          {tool.name}
        </Link>
      </h2>
      <p style={{ fontSize: "var(--fs-copy)", lineHeight: 1.7, color: "var(--muted)", margin: "8px 0 0", maxWidth: "var(--w-measure)" }}>
        {tool.blurb}
      </p>

      {tool.pages && tool.pages.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.3, margin: "18px 0 8px" }}>
            Ready-made runs
          </h3>
          {/* A plain list of bare-path anchors. Never `?p=…` deep links — those are
              the near-duplicate query URLs the preset pages exist to replace. */}
          <ul style={{ margin: 0, paddingLeft: 20, columns: "220px 2", columnGap: 24 }}>
            {tool.pages.map((p) => (
              <li key={p.path} style={{ fontSize: 14, lineHeight: 1.9, breakInside: "avoid" }}>
                <Link href={p.path} style={{ color: "var(--text)" }}>
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
