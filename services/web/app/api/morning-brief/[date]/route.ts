import { handle } from "@/lib/api";
import { getMorningBrief } from "@/lib/queries";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One brief's full markdown — scoped to the signed-in user. */
export async function GET(_req: Request, ctx: { params: Promise<{ date: string }> }) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  const { date } = await ctx.params;
  return handle(() => getMorningBrief(uid, date));
}
