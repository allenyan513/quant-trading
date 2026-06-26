import { authedRoute } from "@/lib/route";
import { portfolioPost } from "@/lib/portfolio-proxy";

export const runtime = "nodejs";

/** Reset the signed-in user's paper account (wipe positions + blotter, restore cash). */
export const POST = authedRoute((uid) => portfolioPost("/paper/reset", { userId: uid }));
