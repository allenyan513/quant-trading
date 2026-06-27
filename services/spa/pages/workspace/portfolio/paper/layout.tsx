import { Outlet } from "react-router-dom";
import { LedgerMetrics } from "@/components/portfolio/ledger-metrics";
import { LedgerTabs } from "@/components/portfolio/ledger-tabs";
import { PaperMatchOnOpen } from "@/components/paper-match";

/** Paper ledger: KPI strip + sub-tab bar over the per-user paper account. */
export default function PaperLayout() {
  return (
    <div>
      {/* Fill any resting limit orders that have crossed (matched on open — no cron). */}
      <PaperMatchOnOpen />
      <LedgerMetrics ledger="paper" />
      <LedgerTabs base="/workspace/portfolio/paper" ledger="paper" />
      <Outlet />
    </div>
  );
}
