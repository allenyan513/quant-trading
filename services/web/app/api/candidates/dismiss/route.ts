import { deliverJson } from "@qt/shared";
import { handle } from "@/lib/api";

export const runtime = "nodejs";

// See promote/route.ts: static process.env access (Next inlines it); config's
// dynamic requireEnv isn't inlined and reads empty in the route runtime.
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

/** Dismiss a candidate. Forwards to the data service (the owner); web stays read-only. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string };
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new Error("symbol required");
    const res = await deliverJson(`${dataUrl()}/candidates/dismiss`, { symbol });
    if (!res.ok) throw new Error(res.error ?? `data service returned ${res.status}`);
    return { symbol, dismissed: true };
  });
}
