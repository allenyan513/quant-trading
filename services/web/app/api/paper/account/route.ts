import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUserOr401 } from "@/lib/session";
import { getPaperAccount } from "@qt/shared/paper-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's paper account: cash, cumulative realized P&L, net positions,
 *  and recent blotter. Read straight from the DB (web read-only). */
export async function GET() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(() => getPaperAccount(db(), uid));
}
