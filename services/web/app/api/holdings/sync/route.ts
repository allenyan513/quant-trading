import { handle } from "@/lib/api";
import { portfolioPost } from "@/lib/portfolio-proxy";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trigger a sync of THIS user's holdings — portfolio owns the work, so this
 *  forwards with the user's id as the account id. Used by the Settings "refresh"
 *  button + the auto-sync right after connecting. */
export async function POST() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(() => portfolioPost("/holdings/sync", { accountId: uid }));
}
