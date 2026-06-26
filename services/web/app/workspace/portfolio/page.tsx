import { redirect } from "next/navigation";

/** Bare Portfolio → the Live ledger workbench (its empty/not-connected state links
 *  to Settings). */
export default function PortfolioIndex() {
  redirect("/workspace/portfolio/live");
}
