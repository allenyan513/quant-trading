import { deliverJson } from "@qt/shared";
import { handle } from "@/lib/api";

export const runtime = "nodejs";

// Web reads env via static process.env access (Next inlines it), like lib/db.ts.
const INGESTION_URL = process.env.INGESTION_URL ?? "http://localhost:8081";

/** Promote a candidate into the watchlist. ingestion owns the write, so this
 *  just forwards (web stays read-only on the DB). Auth'd by the dashboard cookie. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string };
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new Error("symbol required");
    const res = await deliverJson(`${INGESTION_URL}/candidates/promote`, { symbol });
    if (!res.ok) throw new Error(res.error ?? `ingestion returned ${res.status}`);
    return { symbol, promoted: true };
  });
}
