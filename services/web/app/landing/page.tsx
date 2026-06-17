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
          你的股票研究基座
        </h1>
        <p style={{ fontSize: 17, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
          确定性的市场数据、估值与传奇投资人持仓,加上你自己的持仓 —— 通过 MCP 连接你的
          Claude,让你的 AI 在可信数据上做研究。数据在我们这,智能在你那。
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
            开始使用
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
            登录
          </Link>
        </div>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", marginTop: 28, flexWrap: "wrap", color: "var(--muted)", fontSize: 14 }}>
          <span>· 参考估值 + 财务</span>
          <span>· 传奇投资人 13F</span>
          <span>· 你的实盘持仓(私密)</span>
          <span>· Claude MCP 连接</span>
        </div>
      </div>
    </main>
  );
}
