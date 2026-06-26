import { handle } from "@/lib/api";
import { requireUserOr401 } from "@/lib/session";
import { portfolioPost } from "@/lib/portfolio-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reset the signed-in user's paper account (wipe positions + blotter, restore cash). */
export async function POST() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(() => portfolioPost("/paper/reset", { userId: uid }));
}
