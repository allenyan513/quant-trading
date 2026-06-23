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
      "Sole receiver of external data: periodically pulls the watchlist, aggregates notifications, and runs the screener scanner. No LLM.",
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
      "valuation_snapshots",
      "events",
      "notifications",
      "news_items",
      "13f_filers",
      "13f_holdings",
      "13f_cusip_map",
    ],
    pages: [
      { href: "/workspace/data/watchlist", label: "Watchlist" },
      { href: "/workspace/data/morning-brief", label: "Morning Brief" },
      { href: "/workspace/data/holdings", label: "Holdings" },
      { href: "/workspace/data/legends", label: "Legends 13F" },
      { href: "/workspace/data/news", label: "News" },
      { href: "/workspace/data/events", label: "Events" },
      { href: "/workspace/data/notifications", label: "Notifications" },
      { href: "/workspace/data/candidates", label: "Candidates" },
      { href: "/workspace/data/freshness", label: "Freshness" },
    ],
  },
  {
    name: "alpha",
    label: "Alpha",
    port: 8082,
    color: "#a371f7",
    blurb:
      "The only real LLM agent in the system: reprices notifications into trading signals (reading data's precomputed reference valuation snapshot as one input).",
    tables: ["trading_signals", "signal_audits"],
    pages: [
      { href: "/workspace/alpha/signals", label: "Signals" },
      { href: "/workspace/alpha/valuations", label: "Valuations" },
    ],
  },
  {
    name: "portfolio",
    label: "Portfolio",
    port: 8084,
    color: "#f0883e",
    blurb:
      "Sole owner of the positions ledger: deterministic sizing to open positions, settling closes on stop-loss / take-profit / expiry. No LLM.",
    tables: ["positions"],
    pages: [{ href: "/workspace/portfolio/positions", label: "Positions" }],
  },
];

/** Cross-cutting pages that don't belong to a single subsystem. */
export const SYSTEM_PAGES: SubsystemPage[] = [
  { href: "/workspace/system", label: "Overview" },
  { href: "/workspace/system/logs", label: "Logs" },
];

/**
 * Product-facing sidebar grouping (issue: nav restructure, Phase 1). The backend
 * is still three services (SUBSYSTEMS above — that stays the source of truth for
 * page chips, landing pages, the overview swimlanes and health). But the user-facing
 * nav is grouped by TASK like a trading platform (IBKR/moomoo), not by which service
 * owns the data: Portfolio / Watchlist / Discover / News / Alpha, plus a collapsed
 * System area for the engineering/observability pages. Hrefs are unchanged — this is
 * a presentation regroup only, no routes moved. The paper-trading ledger
 * (/portfolio/positions) is intentionally omitted (hidden) for now.
 */
export interface NavSection {
  label: string;
  /** Wayfinding dot colour for the section (no longer tints text/active state —
   *  the nav uses a single accent; see components/nav.tsx). */
  color: string;
  pages: SubsystemPage[];
  /** Collapsed by default (engineering/internal area). */
  collapsed?: boolean;
  /** De-emphasised in the nav (rendered dimmer). v1 demotes the Alpha automated
   *  signal loop while keeping its routes alive — North Star §10. */
  dimmed?: boolean;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Portfolio",
    color: "#f0883e",
    pages: [
      { href: "/workspace/data/holdings", label: "Portfolio" }, // your real (IBKR-synced) holdings
      { href: "/workspace/data/morning-brief", label: "Morning Brief" },
    ],
  },
  {
    label: "Watchlist",
    color: "#3fb950",
    pages: [{ href: "/workspace/data/watchlist", label: "Watchlist" }],
  },
  {
    label: "Discover",
    color: "#58a6ff",
    pages: [
      { href: "/workspace/data/movers", label: "Market movers" },
      { href: "/workspace/data/candidates", label: "Screener" },
      { href: "/workspace/data/earnings", label: "Earnings calendar" },
      { href: "/workspace/data/economic", label: "Economic calendar" },
      { href: "/workspace/data/legends", label: "Legends 13F" },
    ],
  },
  {
    label: "News",
    color: "#d29922",
    pages: [{ href: "/workspace/data/news", label: "News" }],
  },
  {
    label: "Alpha",
    color: "#a371f7",
    dimmed: true, // demoted in v1 (MCP + facts is the focus); routes stay alive
    pages: [
      { href: "/workspace/alpha/signals", label: "Signals" },
      { href: "/workspace/alpha/valuations", label: "Valuations" },
    ],
  },
  {
    label: "System",
    color: "#8a97ab",
    collapsed: true,
    pages: [
      { href: "/workspace/system", label: "Overview" },
      { href: "/workspace/system/logs", label: "Logs" },
      { href: "/workspace/data/events", label: "Events" },
      { href: "/workspace/data/notifications", label: "Notifications" },
      { href: "/workspace/data/freshness", label: "Freshness" },
    ],
  },
];


export function subsystemByName(name: string): Subsystem | undefined {
  return SUBSYSTEMS.find((s) => s.name === name);
}

export function subsystemColor(name: string): string {
  return subsystemByName(name)?.color ?? "#8a97ab";
}

/** Which product nav section a path belongs to — the section owning the page whose
 *  href is the longest prefix of `pathname` (so /data/holdings/positions → Portfolio).
 *  Used by the page header chip so every page reads as its product area, not its
 *  backend owner. */
export function navSectionForPath(pathname: string | null): NavSection | undefined {
  if (!pathname) return undefined; // usePathname() can be null (pre-render / no router ctx)
  let best: { section: NavSection; len: number } | undefined;
  for (const section of NAV_SECTIONS) {
    for (const p of section.pages) {
      if ((pathname === p.href || pathname.startsWith(`${p.href}/`)) && (!best || p.href.length > best.len)) {
        best = { section, len: p.href.length };
      }
    }
  }
  return best?.section;
}
