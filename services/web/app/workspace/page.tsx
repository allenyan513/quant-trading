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
  if (!user) redirect("/"); // middleware already guards; defensive
  const s = await getOnboardingStatus(user.id);
  const allDone = s.ibkrConnected && s.watchlistCount > 0 && s.claudeConnected;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px" }}>
        {allDone ? "You're all set 🎉" : `Get started${user.name ? `, ${user.name}` : ""}`}
      </h1>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: 14, lineHeight: 1.6 }}>
        {allDone
          ? "All three steps are done. Come back anytime to manage them, or head straight into your Claude to research."
          : "Three steps to connect the platform to your own Claude — the data lives here, the intelligence lives in your Claude."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
        <Step
          n={1}
          done={s.ibkrConnected}
          title="Connect your IBKR account"
          desc="Sync your holdings, trades, and NAV curve via an IBKR Flex query (read-only)."
          badge={s.ibkrConnected ? "Connected" : "Not connected"}
          cta={{ href: "/workspace/portfolio/live/settings", label: s.ibkrConnected ? "Manage" : "Connect" }}
        />
        <Step
          n={2}
          done={s.watchlistCount > 0}
          title="Build your watchlist"
          desc="Add the stocks you follow — valuation, buy zone, and whether you hold them at a glance, ready to feed to your Claude."
          badge={s.watchlistCount > 0 ? `${s.watchlistCount} symbols` : "Empty"}
          cta={{ href: "/workspace/watchlist", label: s.watchlistCount > 0 ? "Manage" : "Add" }}
        />
        <Step
          n={3}
          done={s.claudeConnected}
          title="Connect your Claude (core)"
          desc="Add the MCP URL below to your own Claude so it can research on trusted data plus your holdings."
          badge={s.claudeConnected ? "Authorized" : "Not connected"}
        >
          <ConnectClaude />
        </Step>
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, alignItems: "center" }}>
        <span style={{ color: "var(--muted)" }}>Explore:</span>
        <Link href="/workspace/watchlist" style={LINK}>Watchlist</Link>
        <Link href="/workspace/portfolio" style={LINK}>Holdings</Link>
        <Link href="/workspace/discover/legends" style={LINK}>Legendary investors 13F</Link>
        <Link href="/workspace/system" style={LINK}>System overview</Link>
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
