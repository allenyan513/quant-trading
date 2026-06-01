import { deliverJson } from "@qt/shared";
import { handle } from "@/lib/api";

export const runtime = "nodejs";

const INGESTION_URL = process.env.INGESTION_URL ?? "http://localhost:8081";

/** Dismiss a candidate. Forwards to ingestion (the owner); web stays read-only. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string };
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new Error("symbol required");
    const res = await deliverJson(`${INGESTION_URL}/candidates/dismiss`, { symbol });
    if (!res.ok) throw new Error(res.error ?? `ingestion returned ${res.status}`);
    return { symbol, dismissed: true };
  });
}
