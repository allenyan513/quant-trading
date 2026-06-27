import { authedRoute } from "@/lib/route";
import { portfolioPost } from "@/lib/portfolio-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Match the signed-in user's resting limit orders against the live quote (fill those
 *  that crossed, expire stale day orders). Triggered on paper page open — no cron. */
export const POST = authedRoute((uid) => portfolioPost("/paper/match", { userId: uid }));
