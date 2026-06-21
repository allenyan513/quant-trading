import Link from "next/link";

/**
 * Public landing — the only thing unauthenticated visitors see. States the
 * vision; entry points to sign in / get started. Polished in P3.
 */
export default function LandingPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 720, textAlign: "center", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: "var(--muted)", textTransform: "uppercase" }}>
          quant-trading
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.15, margin: 0 }}>
          Your stock research foundation
        </h1>
        <p style={{ fontSize: 17, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
          Deterministic market data, valuations, and legendary investors' 13F holdings,
          plus your own positions — connect your Claude over MCP so your AI researches on
          trusted data. The data lives here; the intelligence lives in your Claude.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8 }}>
          <Link
            href="/sign-up"
            style={{
              padding: "11px 22px",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              color: "#fff",
              background: "#238636",
              border: "1px solid #2ea043",
            }}
          >
            Get started
          </Link>
          <Link
            href="/sign-in"
            style={{
              padding: "11px 22px",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text)",
              background: "var(--panel)",
              border: "1px solid var(--border)",
            }}
          >
            Sign in
          </Link>
        </div>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", marginTop: 28, flexWrap: "wrap", color: "var(--muted)", fontSize: 14 }}>
          <span>· Reference valuation + financials</span>
          <span>· Legendary investors 13F</span>
          <span>· Your live holdings (private)</span>
          <span>· Claude MCP connection</span>
        </div>
      </div>
    </main>
  );
}
