/**
 * Single source of truth for the three subsystems the dashboard surfaces.
 *
 * The backend is three independent services (ingestion / analysis / portfolio),
 * each the sole owner of a set of tables (see .claude/rules/services.md). The UI
 * mirrors that boundary: every page belongs to exactly one subsystem, and each
 * subsystem gets a stable accent colour reused across the nav, page headers,
 * the overview swimlanes and the per-subsystem landing pages.
 */

export type SubsystemName = "ingestion" | "analysis" | "portfolio";

export interface SubsystemPage {
  href: string;
  label: string;
}

export interface Subsystem {
  name: SubsystemName;
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
    name: "ingestion",
    label: "Ingestion",
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
    ],
    pages: [
      { href: "/events", label: "Events" },
      { href: "/notifications", label: "Notifications" },
      { href: "/candidates", label: "Candidates" },
      { href: "/data", label: "Data" },
    ],
  },
  {
    name: "analysis",
    label: "Analysis",
    port: 8082,
    color: "#a371f7",
    blurb:
      "系统中唯一的真 LLM agent：把 notifications 重定价为交易信号，并写出估值快照与审计。",
    tables: ["trading_signals", "valuation_snapshots", "signal_audits"],
    pages: [
      { href: "/signals", label: "Signals" },
      { href: "/valuations", label: "Valuations" },
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
    pages: [{ href: "/positions", label: "Positions" }],
  },
];

/** Cross-cutting pages that don't belong to a single subsystem. */
export const SYSTEM_PAGES: SubsystemPage[] = [
  { href: "/", label: "Overview" },
  { href: "/logs", label: "Logs" },
];

export function subsystemByName(name: string): Subsystem | undefined {
  return SUBSYSTEMS.find((s) => s.name === name);
}

export function subsystemColor(name: string): string {
  return subsystemByName(name)?.color ?? "#8a97ab";
}
