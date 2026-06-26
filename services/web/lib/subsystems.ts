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
      "Owner of the trading-accounts domain — three ledgers: Strategy (signal-driven sim), Paper (per-user order-driven), Live (IBKR mirror). No LLM.",
    tables: ["positions", "portfolio_paper_*", "portfolio_holdings_*"],
    pages: [{ href: "/workspace/portfolio/live", label: "Live" }],
  },
];

/** Cross-cutting pages that don't belong to a single subsystem. */
export const SYSTEM_PAGES: SubsystemPage[] = [
  { href: "/workspace/system", label: "Overview" },
  { href: "/workspace/system/logs", label: "Logs" },
];

/**
 * Product-facing left nav — three flat top-level entries (no sub-lists). Each goes to
 * a section: Watchlist (single page + symbol-detail rail), Discover (tabbed:
 * movers/screener/calendars/legends/news) and Portfolio (a Live | Paper ledger toggle,
 * each ledger tabbed Positions/Activity/Performance/Morning brief/Settings). Alpha +
 * System still exist but are intentionally OFF the nav (reach them by URL); the
 * Strategy ledger is off the UI too (backend only).
 */
export interface NavSection {
  label: string;
  /** Top-level destination for this entry. */
  href: string;
  /** Small wayfinding dot colour. */
  color: string;
}

export const NAV_SECTIONS: NavSection[] = [
  { label: "Portfolio", href: "/workspace/portfolio", color: "#f0883e" },
  { label: "Watchlist", href: "/workspace/watchlist", color: "#3fb950" },
  { label: "Discover", href: "/workspace/discover", color: "#58a6ff" },
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
    if ((pathname === section.href || pathname.startsWith(`${section.href}/`)) && (!best || section.href.length > best.len)) {
      best = { section, len: section.href.length };
    }
  }
  return best?.section;
}
