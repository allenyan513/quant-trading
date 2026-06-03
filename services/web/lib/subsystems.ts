/**
 * Single source of truth for the three subsystems the dashboard surfaces.
 *
 * The backend is three independent services (data / alpha / portfolio),
 * each the sole owner of a set of tables (see .claude/rules/services.md). The UI
 * mirrors that boundary: every page belongs to exactly one subsystem, and each
 * subsystem gets a stable accent colour reused across the nav, page headers,
 * the overview swimlanes and the per-subsystem landing pages.
 */

export type SubsystemName = "data" | "alpha" | "portfolio";

export interface SubsystemPage {
  href: string;
  label: string;
}

export interface Subsystem {
  /**
   * Backend service identity — equals the route folder under app/(dashboard),
   * the log/heartbeat `service` name and the funnel keys (see queries.ts
   * SERVICES). Keep all of these in sync when renaming a service.
   */
  name: SubsystemName;
  /** Display name shown in the nav, headers and landing pages. */
  label: string;
  /** Local dev port (docker/compose override it via env). */
  port: number;
  /** Accent colour — the visual identity of this subsystem everywhere. */
  color: string;
  /** One-line responsibility blurb shown on the landing page. */
  blurb: string;
  /** Tables this service is the single writer/owner of. */
  tables: string[];
  /** Dashboard pages that read this subsystem's data. */
  pages: SubsystemPage[];
}

export const SUBSYSTEMS: Subsystem[] = [
  {
    name: "data",
    label: "Data",
    port: 8081,
    color: "#58a6ff",
    blurb:
      "外部数据唯一接收者：定时拉取 watchlist、聚合成 notifications，并运行选股发现 scanner。无 LLM。",
    tables: [
      "universe",
      "watchlist",
      "candidates",
      "daily_prices",
      "income_statement",
      "balance_sheet",
      "cash_flow",
      "financial_ratios",
      "analyst_estimates",
      "events",
      "notifications",
      "news_items",
    ],
    pages: [
      { href: "/data/news", label: "News" },
      { href: "/data/events", label: "Events" },
      { href: "/data/notifications", label: "Notifications" },
      { href: "/data/candidates", label: "Candidates" },
      { href: "/data/freshness", label: "Freshness" },
    ],
  },
  {
    name: "alpha",
    label: "Alpha",
    port: 8082,
    color: "#a371f7",
    blurb:
      "系统中唯一的真 LLM agent：把 notifications 重定价为交易信号，并写出估值快照与审计。",
    tables: ["trading_signals", "valuation_snapshots", "signal_audits"],
    pages: [
      { href: "/alpha/signals", label: "Signals" },
      { href: "/alpha/valuations", label: "Valuations" },
    ],
  },
  {
    name: "portfolio",
    label: "Portfolio",
    port: 8084,
    color: "#f0883e",
    blurb:
      "positions 账本唯一 owner：确定性 sizing 开仓，按止损/止盈/到期结算平仓。无 LLM。",
    tables: ["positions"],
    pages: [{ href: "/portfolio/positions", label: "Positions" }],
  },
];

/** Cross-cutting pages that don't belong to a single subsystem. */
export const SYSTEM_PAGES: SubsystemPage[] = [
  { href: "/system", label: "Overview" },
  { href: "/system/logs", label: "Logs" },
];

export function subsystemByName(name: string): Subsystem | undefined {
  return SUBSYSTEMS.find((s) => s.name === name);
}

export function subsystemColor(name: string): string {
  return subsystemByName(name)?.color ?? "#8a97ab";
}
