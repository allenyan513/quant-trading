import { redirect } from "next/navigation";

// Bare /workspace/discover → land on the first tab.
export default function DiscoverIndex() {
  redirect("/workspace/discover/movers");
}
