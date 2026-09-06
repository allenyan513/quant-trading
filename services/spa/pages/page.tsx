import { useEffect } from "react";
import { Github } from "lucide-react";
import Link from "@/components/link";
import { McpCopyButton } from "@/components/connect-claude";
import { HeroIllustration } from "@/components/hero-illustration";
import { applySeo, HOME_SEO } from "@/lib/seo";
import { PublicFooter, PageSection } from "@/components/public-chrome";
import { TOOLS, TOOLS_PATH } from "@/lib/tools";

const REPO_URL = "https://github.com/allenyan513/quant-trading";

/** How many tools the homepage names before deferring to `/tools`. A front door
 *  can hold a few doors; past that it stops being a front door. Below the cap the
 *  "All tools" link is suppressed — with one tool it would point at a page listing
 *  that same tool, and `/tools` is already linked from the footer on this page. */
const HOME_TOOL_LIMIT = 3;

/**
 * Public marketing homepage — served at `/` (the first thing any visitor sees).
 * Apple-style: a short headline, one-line subtitle, two CTAs (Try · Copy MCP URL)
 * and a single hero illustration, over generous whitespace. Dark, IBKR-clean.
 *
 * PURE STATIC — no session check, no API calls. Fixed CTAs (Try → sign-up, Sign in)
 * instead of a `useSession()`-driven swap, so anonymous + bot traffic on the landing
 * page never touches the gateway (the whole point of the SPA/gateway split). Fluid
 * type (clamp) + flex-wrap keep it responsive with no media queries.
 */
export default function HomePage() {
  // Head tags only — no request. A cold load is already prerendered with these;
  // this covers arriving from a tool page via in-app navigation.
  useEffect(() => applySeo(HOME_SEO), []);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <header>
        {/* The homepage keeps its own header (GitHub link, different CTA) but sits
            in the same column as every other public page — see public-chrome.tsx. */}
        <PageSection as="div" pad="flush" style={{ display: "flex", alignItems: "center", gap: "clamp(12px, 3vw, 18px)", paddingTop: 16, paddingBottom: 16 }}>
        <div style={{ flex: 1, fontWeight: 800, letterSpacing: 0.3, fontSize: 16 }}>
          <span style={{ color: "var(--accent)" }}>Sweet</span>ValueLab
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository (open source)"
          title="Open source on GitHub"
          style={{ display: "inline-flex", alignItems: "center", color: "var(--muted)" }}
        >
          <Github size={20} strokeWidth={1.75} />
        </a>
        <Link href="/sign-in" style={{ fontSize: 14, color: "var(--text)" }}>
          Sign in
        </Link>
        <Link
          href="/workspace"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 36,
            padding: "0 16px",
            borderRadius: 999,
            background: "var(--accent)",
            color: "#06223f",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Workspace
        </Link>
        </PageSection>
      </header>

      {/* Hero */}
      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "var(--page-top-hero) var(--page-gutter) 48px",
          gap: 22,
        }}
      >
        <h1 style={{ fontSize: "var(--fs-display)", fontWeight: 800, lineHeight: 1.05, letterSpacing: -1, margin: 0, maxWidth: 760 }}>
          Turn Claude into your investment agent.
        </h1>
        <p style={{ fontSize: "var(--fs-lead-display)", color: "var(--muted)", lineHeight: 1.5, margin: 0, maxWidth: 560 }}>
          Research, paper-trade, and review your portfolio — just by chatting.
        </p>

        {/* Two CTAs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 4, maxWidth: "100%" }}>
          <Link
            href="/sign-up"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 48,
              padding: "0 28px",
              borderRadius: 999,
              background: "var(--accent)",
              color: "#06223f",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            Try it free
          </Link>
          <McpCopyButton />
        </div>

        {/* Hero illustration */}
        <div style={{ width: "100%", maxWidth: 680, marginTop: "clamp(24px, 5vw, 48px)" }}>
          <HeroIllustration />
        </div>
      </section>

      {/* Three-step flow — Connect → Chat & trade → Review, all in one conversation */}
      <PageSection style={{ paddingTop: 8, paddingBottom: 24 }}>
        <div style={{ textAlign: "center", marginBottom: "clamp(24px, 5vw, 40px)" }}>
          <h2 style={{ fontSize: "var(--fs-h2-display)", fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>All in one conversation.</h2>
          <p style={{ fontSize: 15, color: "var(--muted)", margin: "8px 0 0" }}>No dashboards to manage — just chat with your Claude.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 28 }}>
          <Step n={1} title="Connect" body="Add SweetValueLab to your Claude as an MCP connector — one URL, once." />
          <Step n={2} title="Chat & trade" body="Ask Claude to research a name, surface a buy/sell signal, and place a paper trade — right in the chat." />
          <Step n={3} title="Review" body="Have Claude replay and review your trades over time. No dashboard required." />
        </div>
      </PageSection>

      {/* Free tools. Generated from the SAME `TOOLS` registry as `/tools` and the
          footer, so shipping a tool cannot leave the homepage behind — this block
          used to name one tool in hardcoded markup.

          The homepage links tools DIRECTLY while the footer links the hub, and the
          difference is deliberate: this is the site's highest-authority page, so
          its links are the most valuable ones a tool can receive, and routing them
          through `/tools` would put a hop of dilution in front of every one. The
          footer has the opposite problem — it renders on every page, so it must
          link the one target that stays correct as tools are added.

          Capped, because the homepage is a front door, not a directory; the rest
          are one click away behind "All tools". Static links, no request. */}
      <PageSection style={{ paddingTop: 8, paddingBottom: 40, textAlign: "center" }}>
        <h2 style={{ fontSize: "var(--fs-h2)", fontWeight: 800, letterSpacing: -0.3, margin: "0 0 6px" }}>
          Free tools, no account
        </h2>
        <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 16px" }}>Open one and start typing — nothing is gated.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", alignItems: "center" }}>
          {TOOLS.slice(0, HOME_TOOL_LIMIT).map((tool) => (
            <Link
              key={tool.path}
              href={tool.path}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 42,
                padding: "0 22px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {tool.name} →
            </Link>
          ))}
        </div>
        {TOOLS.length > HOME_TOOL_LIMIT && (
          <p style={{ margin: "16px 0 0" }}>
            <Link href={TOOLS_PATH} style={{ fontSize: 14, color: "var(--muted)" }}>
              All tools →
            </Link>
          </p>
        )}
      </PageSection>

      <PublicFooter />
    </main>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 999,
          border: "1px solid var(--accent)",
          color: "var(--accent)",
          fontSize: 15,
          fontWeight: 700,
          marginBottom: 12,
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}
