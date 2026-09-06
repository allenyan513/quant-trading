/**
 * Shared chrome AND layout for the PUBLIC (signed-out) surface: the landing page,
 * the free tools, the blog, and the About/Privacy/Terms pages.
 *
 * `PublicPage` + `PageSection` are the only place a public page's container width,
 * gutter and vertical rhythm are written down (values in `src/globals.css`). A
 * page picks a width TIER and never a number — see the token block there for why,
 * and `src/design-system.test.ts` for what stops it drifting again.
 *
 * Everything here is static markup — no session check, no fetch. That is a hard
 * rule for `/` (anonymous and bot traffic must never touch the billed gateway,
 * see `.claude/rules/spa.md`) and these pages are prerendered at build time, so
 * the same discipline applies to all of them.
 *
 * The footer's link list lives here in one place so every public page carries the
 * same internal links — search engines read those links as the site's structure,
 * and a legal/contact link missing from half the pages reads as a trust gap.
 */
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import Link from "@/components/link";

export const CONTACT_EMAIL = "hello@sweetvaluelab.com";
/** Last substantive revision of the About / Privacy / Terms copy. */
export const LEGAL_UPDATED = "2026-09-05";

/**
 * The three container widths (see the token block in `src/globals.css`). Pages
 * pick a tier by what they HOLD — reading column, card grid, or wide data — and
 * never a number: five hand-typed widths is how the public surface ended up with
 * a header that lined up with nothing.
 */
export type PageWidth = "prose" | "page" | "wide";

const WIDTH_VAR: Record<PageWidth, string> = {
  prose: "var(--w-prose)",
  page: "var(--w-page)",
  wide: "var(--w-wide)",
};

/** Set once by `<PublicPage>` and read by the header, the footer and every
 *  section, so the chrome and the content physically cannot disagree about where
 *  the column edge is. */
const PageWidthContext = createContext<PageWidth>("page");

export const usePageWidth = (): PageWidth => useContext(PageWidthContext);

/** Vertical padding presets. Named rather than free-form: the horizontal gutter
 *  is fixed by the token, and these cover every position a section can occupy. */
const PAD: Record<string, string> = {
  /** A page that is one container: full top and bottom padding. */
  page: "var(--page-top) var(--page-gutter) var(--page-bottom)",
  /** First section under the header. */
  top: "var(--page-top) var(--page-gutter) 8px",
  /** A section in the middle of a stack. */
  body: "16px var(--page-gutter)",
  /** Butts against the section above it. */
  flush: "0 var(--page-gutter)",
  /** Last section before the footer. */
  bottom: "24px var(--page-gutter) var(--page-bottom)",
};

export type PagePad = keyof typeof PAD;

/**
 * A centered content column at the page's width. Every public page's content
 * goes through this — it is the only place `max-width` + `margin: 0 auto` +
 * the gutter are written down.
 */
export function PageSection({
  pad = "body",
  as: Tag = "section",
  width,
  style,
  children,
}: {
  pad?: PagePad;
  as?: "section" | "div" | "article";
  /** Overrides the page's tier for one section — for a prose block inside a wide
   *  data page, which is the measure rule in the token block. */
  width?: PageWidth;
  style?: CSSProperties;
  children: ReactNode;
}) {
  // Unconditional: `width ?? useContext(...)` would short-circuit the hook away
  // whenever the prop is set, and a hook that sometimes runs breaks hook order.
  const pageTier = useContext(PageWidthContext);
  const tier = width ?? pageTier;
  return (
    <Tag style={{ width: "100%", maxWidth: WIDTH_VAR[tier], margin: "0 auto", padding: PAD[pad], ...style }}>
      {children}
    </Tag>
  );
}

/** Chrome + the page's width tier, for every public (signed-out) page. */
export function PublicPage({ width, children }: { width: PageWidth; children: ReactNode }) {
  return (
    <PageWidthContext.Provider value={width}>
      <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <PublicHeader />
        {children}
        <PublicFooter />
      </main>
    </PageWidthContext.Provider>
  );
}

export function PublicHeader() {
  return (
    <header style={{ borderBottom: "1px solid transparent" }}>
      {/* Constrained to the page's own column, not full-bleed: the wordmark sits
          directly above the H1 instead of floating off at the viewport edge. */}
      <PageSection as="div" pad="flush" style={{ display: "flex", alignItems: "center", gap: 18, paddingTop: 16, paddingBottom: 16 }}>
        <Link href="/" style={{ flex: 1, fontWeight: 800, letterSpacing: 0.3, fontSize: 16, color: "var(--text)" }}>
          <span style={{ color: "var(--accent)" }}>Sweet</span>ValueLab
        </Link>
        <Link href="/sign-in" style={{ fontSize: 14, color: "var(--muted)" }}>
          Sign in
        </Link>
      </PageSection>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer style={{ marginTop: "auto", borderTop: "1px solid var(--border)" }}>
      {/* The rule spans the viewport; the links line up with the content column. */}
      <PageSection
        as="div"
        pad="flush"
        style={{
          paddingTop: 18,
          paddingBottom: 18,
          display: "flex",
          gap: "10px 18px",
          flexWrap: "wrap",
          alignItems: "center",
          color: "var(--muted)",
          fontSize: 12,
        }}
      >
      <span style={{ flex: 1, minWidth: 240 }}>
        Research &amp; educational tool. Not investment advice. Not a registered investment adviser.
      </span>
      {/* The hub, not one tool: the footer is on every public page, so this is the
          link that has to keep working as tools are added. `/tools` then carries
          the anchors to each of them — one hop from anywhere. */}
      <Link href="/tools" style={{ color: "var(--muted)" }}>
        Tools
      </Link>
      {/* The English index only — same reasoning as `/tools`: the footer links the
          hub, and the hub links onward (including to the Chinese edition). A footer
          that grows a link per language is a footer that grows forever. */}
      <Link href="/blog" style={{ color: "var(--muted)" }}>
        Blog
      </Link>
      <Link href="/about" style={{ color: "var(--muted)" }}>
        About
      </Link>
      <Link href="/privacy" style={{ color: "var(--muted)" }}>
        Privacy
      </Link>
      <Link href="/terms" style={{ color: "var(--muted)" }}>
        Terms
      </Link>
      <span>sweetvaluelab.com</span>
      </PageSection>
    </footer>
  );
}

/** The public surface's H1. One size everywhere except the marketing homepage,
 *  which has its own display step. */
export const pageTitleStyle: CSSProperties = {
  fontSize: "var(--fs-h1)",
  fontWeight: 800,
  letterSpacing: -0.6,
  lineHeight: 1.15,
  margin: 0,
};

/** Header + a readable prose column + footer. For the text pages only. */
export function ProsePage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <PublicPage width="prose">
      <PageSection as="article" pad="page">
        <h1 style={pageTitleStyle}>{title}</h1>
        <p style={{ fontSize: "var(--fs-meta)", color: "var(--muted)", margin: "10px 0 0" }}>
          Last updated <time dateTime={LEGAL_UPDATED}>{LEGAL_UPDATED}</time>
        </p>
        {intro && <p style={{ fontSize: "var(--fs-lead)", lineHeight: 1.65, color: "var(--text)", margin: "20px 0 0" }}>{intro}</p>}
        {children}
      </PageSection>
    </PublicPage>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 30 }}>
      <h2 style={{ fontSize: "var(--fs-h3)", fontWeight: 700, letterSpacing: -0.2, margin: "0 0 8px" }}>{title}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: "var(--fs-copy)", lineHeight: 1.7, color: "var(--muted)", margin: "0 0 10px" }}>{children}</p>;
}

export function Ul({ children }: { children: ReactNode }) {
  return (
    <ul style={{ fontSize: "var(--fs-copy)", lineHeight: 1.7, color: "var(--muted)", margin: "0 0 10px", paddingLeft: 20 }}>
      {children}
    </ul>
  );
}

export function MailLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)" }}>
      {CONTACT_EMAIL}
    </a>
  );
}
