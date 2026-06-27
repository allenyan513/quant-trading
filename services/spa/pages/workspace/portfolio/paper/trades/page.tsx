import { TradesView } from "@/components/portfolio/positions-pane";

/** Paper · Trades — the executed-fill blotter (every fill / rejection). */
export default function PaperTradesPage() {
  return <TradesView ledger="paper" />;
}
