import { handle } from "@/lib/api";
import { listMorningBriefs } from "@/lib/queries";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's morning-brief archive (list view, no markdown body). */
export async function GET() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(() => listMorningBriefs(uid));
}
