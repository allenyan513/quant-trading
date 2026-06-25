import { SectionTabs, type TabDef } from "@/components/section-tabs";

/**
 * Discover section: one top-level entry with a tab bar folding the
 * discovery/market pages (movers, screener, calendars, 13F legends, news).
 * Children render below the tabs; the active tab is the section heading.
 */
const TABS: TabDef[] = [
  { seg: "movers", label: "Market movers" },
  { seg: "screener", label: "Screener" },
  { seg: "earnings", label: "Earnings" },
  { seg: "economic", label: "Economic" },
  { seg: "legends", label: "Legends 13F" },
  { seg: "news", label: "News" },
];

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionTabs base="/workspace/discover" tabs={TABS} defaultSeg="movers" />
      {children}
    </div>
  );
}
