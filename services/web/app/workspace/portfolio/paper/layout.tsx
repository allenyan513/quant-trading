import { SectionTabs, type TabDef } from "@/components/section-tabs";

/** Paper ledger (per-user order-driven sim) sub-tabs. Order entry lives on the
 *  symbol detail right rail — this section is view-only. */
const TABS: TabDef[] = [
  { seg: "positions", label: "Positions" },
  { seg: "activity", label: "Activity" },
];

export default function PaperLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionTabs base="/workspace/portfolio/paper" tabs={TABS} defaultSeg="positions" margin="0 0 16px" />
      {children}
    </div>
  );
}
