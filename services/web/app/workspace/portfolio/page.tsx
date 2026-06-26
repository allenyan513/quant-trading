import { redirect } from "next/navigation";

/** Bare Portfolio → the Paper ledger workbench (the per-user account; Live · IBKR is
 *  one toggle away). */
export default function PortfolioIndex() {
  redirect("/workspace/portfolio/paper");
}
