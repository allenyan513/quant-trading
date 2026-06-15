import { handle } from "@/lib/api";
import { getHoldingsNav } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => getHoldingsNav());
}
