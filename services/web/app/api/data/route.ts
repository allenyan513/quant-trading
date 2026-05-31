import { handle } from "@/lib/api";
import { getDataFreshness } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => getDataFreshness());
}
