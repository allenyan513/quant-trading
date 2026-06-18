import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { getOnboardingStatus } from "@/lib/queries";
import { ConnectClaude } from "@/components/connect-claude";

// The dashboard home is a per-user "getting started" view: the three setup steps
// (connect IBKR · build a watchlist · connect your Claude) with live completion
// status. The ops overview lives at /system (still in the nav).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GREEN = "#3fb950";

export default async function HomePage() {
  const user = await getUser();
  if (!user) redirect("/landing"); // middleware already guards; defensive
  const s = await getOnboardingStatus(user.id);
  const allDone = s.ibkrConnected && s.watchlistCount > 0 && s.claudeConnected;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px" }}>
        {allDone ? "你已经准备就绪 🎉" : `开始上手${user.name ? `，${user.name}` : ""}`}
      </h1>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: 14, lineHeight: 1.6 }}>
        {allDone
          ? "三步都完成了。随时回来管理，或直接去你的 Claude 里做研究。"
          : "三步把平台接上你自己的 Claude —— 数据在我们这，智能在你那。"}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
        <Step
          n={1}
          done={s.ibkrConnected}
          title="连接你的 IBKR 账户"
          desc="用 IBKR Flex 查询(只读)同步你的持仓、成交和净值曲线。"
          badge={s.ibkrConnected ? "已连接" : "未连接"}
          cta={{ href: "/data/holdings/settings", label: s.ibkrConnected ? "管理" : "去连接" }}
        />
        <Step
          n={2}
          done={s.watchlistCount > 0}
          title="建立你的自选"
          desc="加入你关注的股票 —— 估值 / 买入区 / 是否持有一目了然，也能喂给你的 Claude。"
          badge={s.watchlistCount > 0 ? `${s.watchlistCount} 只` : "空"}
          cta={{ href: "/data/watchlist", label: s.watchlistCount > 0 ? "管理" : "去添加" }}
        />
        <Step
          n={3}
          done={s.claudeConnected}
          title="连接你的 Claude（核心）"
          desc="把下面的 MCP 地址接到你自己的 Claude，让它在可信数据 + 你的持仓上做研究。"
          badge={s.claudeConnected ? "已授权" : "未连接"}
        >
          <ConnectClaude />
        </Step>
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, alignItems: "center" }}>
        <span style={{ color: "var(--muted)" }}>探索:</span>
        <Link href="/data/watchlist" style={LINK}>自选</Link>
        <Link href="/data/holdings" style={LINK}>持仓</Link>
        <Link href="/data/legends" style={LINK}>传奇投资人 13F</Link>
        <Link href="/system" style={LINK}>系统总览</Link>
      </div>
    </div>
  );
}

const LINK = { color: "#58a6ff", textDecoration: "none" } as const;

function Step({
  n,
  done,
  title,
  desc,
  badge,
  cta,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  desc: string;
  badge: string;
  cta?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${done ? GREEN : "var(--border)"}`,
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            fontSize: 13,
            fontWeight: 700,
            background: done ? GREEN : "var(--panel-2)",
            color: done ? "#fff" : "var(--muted)",
            border: `1px solid ${done ? GREEN : "var(--border)"}`,
          }}
        >
          {done ? "✓" : n}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
            <span style={{ fontSize: 12, color: done ? GREEN : "var(--muted)", whiteSpace: "nowrap" }}>{badge}</span>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0 0", lineHeight: 1.6 }}>{desc}</p>
          {children && <div style={{ marginTop: 12 }}>{children}</div>}
          {cta && (
            <div style={{ marginTop: 12 }}>
              <Link
                href={cta.href}
                style={{
                  display: "inline-block",
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  color: done ? "var(--text)" : "#fff",
                  background: done ? "var(--panel-2)" : "#238636",
                  border: `1px solid ${done ? "var(--border)" : "#2ea043"}`,
                }}
              >
                {cta.label}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
