import { LedgerMetrics } from "@/components/portfolio/ledger-metrics";
import { LedgerTabs } from "@/components/portfolio/ledger-tabs";

/** Live ledger: KPI strip + sub-tab bar over the read-only IBKR account. */
export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <LedgerMetrics ledger="live" />
      <LedgerTabs base="/workspace/portfolio/live" />
      {children}
    </div>
  );
}
