import { PageTitle } from "@/components/page-title";
import { HoldingsTabs } from "@/components/holdings-tabs";

/**
 * Shared chrome for the live-account (IBKR) page: title + tab bar. Next
 * preserves this layout across tab navigation (only {children} swaps). The
 * data subsystem owns the data_holdings_* tables, so it lives under /data.
 */
export default function HoldingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageTitle subsystem="data" sub="Live IBKR account (Flex sync) — NAV / Holdings / Trades / Connection">
        Portfolio
      </PageTitle>
      <HoldingsTabs />
      {children}
    </div>
  );
}
