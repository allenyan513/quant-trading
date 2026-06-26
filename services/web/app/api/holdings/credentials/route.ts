import { portfolioPost } from "@/lib/portfolio-proxy";
import { getHoldingsStatus } from "@/lib/queries";
import { authedRoute, readBody } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Connection status for the signed-in user (never returns the token). */
export const GET = authedRoute((uid) => getHoldingsStatus(uid));

/** Save/update this user's IBKR Flex credentials — portfolio owns the write (and
 *  encrypts the token), so this forwards with the user's id as the account id. */
export const POST = authedRoute(async (uid, req) => {
  const body = await readBody<{ token?: string; queryId?: string }>(req);
  const token = (body.token ?? "").trim();
  const queryId = (body.queryId ?? "").trim();
  if (!token || !queryId) throw new Error("token and queryId are required");
  return portfolioPost("/holdings/credentials", { accountId: uid, token, queryId });
});
