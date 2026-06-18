import { handle } from "@/lib/api";
import { getDataFreshness } from "@/lib/queries";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-symbol data freshness for the signed-in user's watchlist. */
export async function GET() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(() => getDataFreshness(uid));
}
