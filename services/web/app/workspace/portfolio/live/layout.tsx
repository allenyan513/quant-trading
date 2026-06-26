import { SectionTabs, type TabDef } from "@/components/section-tabs";

/** Live ledger (read-only IBKR account) sub-tabs. */
const TABS: TabDef[] = [
  { seg: "positions", label: "Positions" },
  { seg: "performance", label: "Performance" },
  { seg: "trades", label: "Activity" },
  { seg: "morning-brief", label: "Morning brief" },
  { seg: "settings", label: "Settings" },
];

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionTabs base="/workspace/portfolio/live" tabs={TABS} defaultSeg="positions" margin="0 0 16px" />
      {children}
    </div>
  );
}
