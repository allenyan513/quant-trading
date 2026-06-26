import { ActivityView } from "@/components/portfolio/positions-pane";

/** Live · Activity — executed trades (IBKR Flex). */
export default function LiveActivityPage() {
  return <ActivityView ledger="live" />;
}
