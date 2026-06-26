import { ActivityView } from "@/components/portfolio/positions-pane";

/** Paper · Activity — the order blotter (every fill / rejection). */
export default function PaperActivityPage() {
  return <ActivityView ledger="paper" />;
}
