import { deliverJson } from "@qt/shared";
import { handle } from "@/lib/api";

export const runtime = "nodejs";

// See promote/route.ts: static process.env access (Next inlines it); config's
// dynamic requireEnv isn't inlined and reads empty in the route runtime.
function ingestionUrl(): string {
  const u = process.env.INGESTION_URL;
  if (!u) throw new Error("Missing required env var: INGESTION_URL");
  return u;
}

/** Dismiss a candidate. Forwards to ingestion (the owner); web stays read-only. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string };
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new Error("symbol required");
    const res = await deliverJson(`${ingestionUrl()}/candidates/dismiss`, { symbol });
    if (!res.ok) throw new Error(res.error ?? `ingestion returned ${res.status}`);
    return { symbol, dismissed: true };
  });
}
