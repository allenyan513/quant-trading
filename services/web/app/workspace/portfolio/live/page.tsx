import { redirect } from "next/navigation";

/** Bare Live ledger → its positions tab. */
export default function LiveIndex() {
  redirect("/workspace/portfolio/live/positions");
}
