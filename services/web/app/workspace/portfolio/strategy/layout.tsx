import { SectionTabs, type TabDef } from "@/components/section-tabs";

/** Strategy ledger (alpha-signal-driven sim) sub-tabs. */
const TABS: TabDef[] = [{ seg: "positions", label: "Positions" }];

export default function StrategyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionTabs base="/workspace/portfolio/strategy" tabs={TABS} defaultSeg="positions" margin="0 0 16px" />
      {children}
    </div>
  );
}
