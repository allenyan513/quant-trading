import { LedgerMetrics } from "@/components/portfolio/ledger-metrics";
import { LedgerTabs } from "@/components/portfolio/ledger-tabs";

/** Paper ledger: KPI strip + sub-tab bar over the per-user paper account. */
export default function PaperLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <LedgerMetrics ledger="paper" />
      <LedgerTabs base="/workspace/portfolio/paper" />
      {children}
    </div>
  );
}
