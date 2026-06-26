import { handle } from "@/lib/api";
import { portfolioPost } from "@/lib/portfolio-proxy";
import { getHoldingsStatus } from "@/lib/queries";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Connection status for the signed-in user (never returns the token). */
export async function GET() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(() => getHoldingsStatus(uid));
}

/** Save/update this user's IBKR Flex credentials — portfolio owns the write (and
 *  encrypts the token), so this forwards with the user's id as the account id. */
export async function POST(req: Request) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { token?: string; queryId?: string };
    const token = (body.token ?? "").trim();
    const queryId = (body.queryId ?? "").trim();
    if (!token || !queryId) throw new Error("token and queryId are required");
    return portfolioPost("/holdings/credentials", { accountId: uid, token, queryId });
  });
}
