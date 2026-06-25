import { SectionTabs, type TabDef } from "@/components/section-tabs";

/**
 * Portfolio section: your live IBKR account (Flex sync) + morning brief, folded
 * into one top-level entry with a tab bar. The holdings sub-pages (positions /
 * performance / trades / settings) are flattened up to these tabs.
 */
const TABS: TabDef[] = [
  { seg: "positions", label: "Positions" },
  { seg: "performance", label: "Performance" },
  { seg: "trades", label: "Trades" },
  { seg: "morning-brief", label: "Morning brief" },
  { seg: "settings", label: "Settings" },
];

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionTabs base="/workspace/portfolio" tabs={TABS} defaultSeg="positions" />
      {children}
    </div>
  );
}
