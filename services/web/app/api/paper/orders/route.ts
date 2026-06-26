import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUserOr401 } from "@/lib/session";
import { getPaperAccount } from "@qt/shared/paper-read";
import { portfolioPost } from "@/lib/portfolio-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Blotter — the signed-in user's recent paper orders (array, for LiveTable). */
export async function GET() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => (await getPaperAccount(db(), uid, { ordersLimit: 200 })).orders);
}

/** Place a market paper order. web is read-only, so it forwards to the portfolio
 *  service with the SESSION user (never a client-supplied userId). */
export async function POST(req: Request) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return handle(() =>
    portfolioPost("/paper/orders", {
      userId: uid,
      symbol: String(body.symbol ?? ""),
      side: String(body.side ?? ""),
      quantity: Number(body.quantity),
      source: "manual",
    }),
  );
}
