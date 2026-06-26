import { redirect } from "next/navigation";

/** Bare Paper ledger → its positions tab. */
export default function PaperIndex() {
  redirect("/workspace/portfolio/paper/positions");
}
