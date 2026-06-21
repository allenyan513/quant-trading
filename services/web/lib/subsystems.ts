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
      { href: "/data/watchlist", label: "Watchlist" },
      { href: "/data/morning-brief", label: "Morning Brief" },
      { href: "/data/holdings", label: "Holdings" },
      { href: "/data/legends", label: "Legends 13F" },
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
      "The only real LLM agent in the system: reprices notifications into trading signals (reading data's precomputed reference valuation snapshot as one input).",
    tables: ["trading_signals", "signal_audits"],
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
      "Sole owner of the positions ledger: deterministic sizing to open positions, settling closes on stop-loss / take-profit / expiry. No LLM.",
    tables: ["positions"],
    pages: [{ href: "/portfolio/positions", label: "Positions" }],
  },
];

/** Cross-cutting pages that don't belong to a single subsystem. */
export const SYSTEM_PAGES: SubsystemPage[] = [
  { href: "/system", label: "Overview" },
  { href: "/system/logs", label: "Logs" },
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
  /** Accent colour for the section + its active page links. */
  color: string;
  pages: SubsystemPage[];
  /** Collapsed by default (engineering/internal area). */
  collapsed?: boolean;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Portfolio",
    color: "#f0883e",
    pages: [
      { href: "/data/holdings", label: "Portfolio" }, // your real (IBKR-synced) holdings
      { href: "/data/morning-brief", label: "Morning Brief" },
    ],
  },
  {
    label: "Watchlist",
    color: "#3fb950",
    pages: [{ href: "/data/watchlist", label: "Watchlist" }],
  },
  {
    label: "Discover",
    color: "#58a6ff",
    pages: [
      { href: "/data/movers", label: "Market movers" },
      { href: "/data/candidates", label: "Screener" },
      { href: "/data/earnings", label: "Earnings calendar" },
      { href: "/data/economic", label: "Economic calendar" },
      { href: "/data/legends", label: "Legends 13F" },
    ],
  },
  {
    label: "News",
    color: "#d29922",
    pages: [{ href: "/data/news", label: "News" }],
  },
  {
    label: "Alpha",
    color: "#a371f7",
    pages: [
      { href: "/alpha/signals", label: "Signals" },
      { href: "/alpha/valuations", label: "Valuations" },
    ],
  },
  {
    label: "System",
    color: "#8a97ab",
    collapsed: true,
    pages: [
      { href: "/system", label: "Overview" },
      { href: "/system/logs", label: "Logs" },
      { href: "/data/events", label: "Events" },
      { href: "/data/notifications", label: "Notifications" },
      { href: "/data/freshness", label: "Freshness" },
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
