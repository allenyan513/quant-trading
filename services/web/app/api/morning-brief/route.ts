import { listMorningBriefs } from "@/lib/queries";
import { authedRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's morning-brief archive (list view, no markdown body). */
export const GET = authedRoute((uid) => listMorningBriefs(uid));
