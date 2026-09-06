/**
 * Shared chrome for the PUBLIC (signed-out) surface: the landing page, the free
 * tools, and the About/Privacy/Terms pages.
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
import type { ReactNode } from "react";
import Link from "@/components/link";

export const CONTACT_EMAIL = "hello@sweetvaluelab.com";
/** Last substantive revision of the About / Privacy / Terms copy. */
export const LEGAL_UPDATED = "2026-09-05";

export function PublicHeader() {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px clamp(16px, 5vw, 40px)" }}>
      <Link href="/" style={{ flex: 1, fontWeight: 800, letterSpacing: 0.3, fontSize: 16, color: "var(--text)" }}>
        <span style={{ color: "var(--accent)" }}>Sweet</span>ValueLab
      </Link>
      <Link href="/sign-in" style={{ fontSize: 14, color: "var(--muted)" }}>
        Sign in
      </Link>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer
      style={{
        marginTop: "auto",
        borderTop: "1px solid var(--border)",
        padding: "18px clamp(20px, 5vw, 40px)",
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
    </footer>
  );
}

/** Header + a readable prose column + footer. For the text pages only. */
export function ProsePage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PublicHeader />
      <article style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "clamp(20px, 5vw, 48px) clamp(16px, 5vw, 40px) 40px" }}>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.15, margin: 0 }}>{title}</h1>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
          Last updated <time dateTime={LEGAL_UPDATED}>{LEGAL_UPDATED}</time>
        </p>
        {intro && <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--text)", margin: "20px 0 0" }}>{intro}</p>}
        {children}
      </article>
      <PublicFooter />
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 30 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.2, margin: "0 0 8px" }}>{title}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)", margin: "0 0 10px" }}>{children}</p>;
}

export function Ul({ children }: { children: ReactNode }) {
  return (
    <ul style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)", margin: "0 0 10px", paddingLeft: 20 }}>{children}</ul>
  );
}

export function MailLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)" }}>
      {CONTACT_EMAIL}
    </a>
  );
}
