import { portfolioPost } from "@/lib/portfolio-proxy";
import { authedRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trigger a sync of THIS user's holdings — portfolio owns the work, so this
 *  forwards with the user's id as the account id. Used by the Settings "refresh"
 *  button + the auto-sync right after connecting. */
export const POST = authedRoute((uid) => portfolioPost("/holdings/sync", { accountId: uid }));
