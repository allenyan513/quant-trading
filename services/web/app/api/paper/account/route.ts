import { db } from "@/lib/db";
import { authedRoute } from "@/lib/route";
import { getPaperAccount } from "@qt/shared/paper-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's paper account: cash, cumulative realized P&L, net positions,
 *  and recent blotter. Read straight from the DB (web read-only). */
export const GET = authedRoute((uid) => getPaperAccount(db(), uid));
