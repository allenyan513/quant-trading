import Link from "next/link";
import { ConnectClaude } from "@/components/connect-claude";
import { getUser } from "@/lib/session";

/**
 * Public marketing homepage — served at `/` (the first thing any visitor sees).
 * SweetValueLab: title + subtitle + a media slot (future demo video/gif) + the
 * core MCP-connect block + 3 features. Fully public, open sign-up — no invite gate.
 * Dark, IBKR-clean. Copy is refinable.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // read the session to swap the top-bar CTA when logged in

export default async function HomePage() {
  const user = await getUser();
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontWeight: 800, letterSpacing: 0.3, fontSize: 16 }}>
          <span style={{ color: "var(--accent)" }}>Sweet</span>ValueLab
        </div>
        {user ? (
          <Link
            href="/workspace"
            style={{ fontSize: 13, fontWeight: 600, color: "#06223f", background: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 8, padding: "6px 14px" }}
          >
            Open workspace
          </Link>
        ) : (
          <Link href="/sign-in" style={{ fontSize: 13, color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px" }}>
            Sign in
          </Link>
        )}
      </header>

      {/* Hero: title + subtitle */}
      <section style={{ textAlign: "center", padding: "56px 24px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.12, margin: 0, maxWidth: 780 }}>
          The facts layer for<br />AI-native equity research
        </h1>
        <p style={{ fontSize: 17, color: "var(--muted)", lineHeight: 1.6, margin: 0, maxWidth: 600 }}>
          Point-in-time-correct US-equity facts — filings, ownership, valuation. The data lives here;
          the intelligence lives in your own Claude. Connect over MCP and research in plain language.
        </p>
      </section>

      {/* Media slot — placeholder for a future demo video / animation */}
      <section style={{ padding: "0 24px", width: "100%", maxWidth: 920, margin: "0 auto" }}>
        <div
          style={{
            border: "1px dashed var(--border)",
            borderRadius: 12,
            background: "var(--panel)",
            height: 360,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--muted)",
            fontSize: 14,
          }}
        >
          Product demo — coming soon
        </div>
      </section>

      {/* MCP connect — the core entry point */}
      <section style={{ padding: "40px 24px 8px", width: "100%", maxWidth: 720, margin: "0 auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", textAlign: "center" }}>Connect your Claude</h2>
        <p style={{ fontSize: 14, color: "var(--muted)", textAlign: "center", margin: "0 0 18px" }}>
          Copy the MCP URL and add it as a connector in Claude. Sign in once to authorize — then research by chatting.
        </p>
        <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
          <ConnectClaude />
        </div>
      </section>

      {/* 3 features */}
      <section style={{ padding: "36px 24px 8px", width: "100%", maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <Feature
            title="Trustworthy facts"
            body="PIT-correct market data, SEC filings, 13F holdings, ownership, insiders, and a deterministic reference valuation — no hallucinated numbers."
          />
          <Feature
            title="Your own Claude"
            body="Connect over MCP and research in natural language — your Claude reasons over our facts and the live web, on your own subscription."
          />
          <Feature
            title="Pro research terminal"
            body="Prefer a screen? The workspace visualizes the same facts like a pro terminal — valuation, ownership, filings, watchlist, holdings."
          />
        </div>
      </section>

      <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 14, padding: "28px 24px 36px", margin: 0 }}>
        Built for long-term value &amp; growth research — not intraday, HFT, or timing.
      </p>

      {/* Footer */}
      <footer
        style={{
          marginTop: "auto",
          borderTop: "1px solid var(--border)",
          padding: "14px 24px",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          color: "var(--muted)",
          fontSize: 12,
        }}
      >
        <span style={{ flex: 1, minWidth: 240 }}>
          Research &amp; educational tool. Not investment advice. Not a registered investment adviser.
        </span>
        <span>sweetvaluelab.com</span>
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>{body}</p>
    </div>
  );
}
