import { redirect } from "next/navigation";

/** Bare Strategy ledger → its positions tab. */
export default function StrategyIndex() {
  redirect("/workspace/portfolio/strategy/positions");
}
