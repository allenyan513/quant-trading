import Link from "@/components/link";
import { McpCopyButton } from "@/components/connect-claude";
import { HeroIllustration } from "@/components/hero-illustration";

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
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px clamp(16px, 5vw, 40px)" }}>
        <div style={{ flex: 1, fontWeight: 800, letterSpacing: 0.3, fontSize: 16 }}>
          <span style={{ color: "var(--accent)" }}>Sweet</span>ValueLab
        </div>
        <Link href="/sign-in" style={{ fontSize: 14, color: "var(--muted)" }}>
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "clamp(40px, 8vw, 88px) clamp(20px, 5vw, 40px) 48px",
          gap: 22,
        }}
      >
        <h1 style={{ fontSize: "clamp(36px, 7vw, 64px)", fontWeight: 800, lineHeight: 1.05, letterSpacing: -1, margin: 0, maxWidth: 760 }}>
          Turn Claude into your investment agent.
        </h1>
        <p style={{ fontSize: "clamp(16px, 2.4vw, 21px)", color: "var(--muted)", lineHeight: 1.5, margin: 0, maxWidth: 560 }}>
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

      {/* Light feature strip */}
      <section style={{ width: "100%", maxWidth: 960, margin: "0 auto", padding: "8px clamp(20px, 5vw, 40px) 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 28 }}>
          <Feature title="Trustworthy facts" body="PIT-correct filings, 13F holdings, ownership, insiders, and a deterministic reference valuation — no hallucinated numbers." />
          <Feature title="Your own Claude" body="Connect over MCP and research in natural language, on your own subscription. The intelligence stays yours." />
          <Feature title="Pro terminal" body="Prefer a screen? The workspace visualizes the same facts — valuation, ownership, filings, watchlist, holdings." />
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          marginTop: "auto",
          borderTop: "1px solid var(--border)",
          padding: "16px clamp(20px, 5vw, 40px)",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          color: "var(--muted)",
          fontSize: 12,
        }}
      >
        <span style={{ flex: 1, minWidth: 240 }}>Research &amp; educational tool. Not investment advice. Not a registered investment adviser.</span>
        <span>sweetvaluelab.com</span>
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}
