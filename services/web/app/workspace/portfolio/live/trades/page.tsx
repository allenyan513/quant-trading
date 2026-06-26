import { TradesView } from "@/components/portfolio/positions-pane";

/** Live · Trades — executed trades (IBKR Flex). */
export default function LiveTradesPage() {
  return <TradesView ledger="live" />;
}
