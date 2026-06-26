import { getHoldingsNav } from "@/lib/queries";
import { authedRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = authedRoute((uid) => getHoldingsNav(uid));
