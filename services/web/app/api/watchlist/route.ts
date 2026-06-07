import { handle } from "@/lib/api";
import { listWatchlistOverview } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// data owns the watchlist table (T12): reads come from the DB directly (with the
// valuation/position join), writes forward to the data service. Static
// process.env.DATA_URL (Next inlines it; config.dataUrl would read empty here).
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

export async function GET() {
  return handle(() => listWatchlistOverview());
}

/** Manually add a symbol. Forwards to the data service. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string };
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new Error("symbol required");
    const resp = await fetch(`${dataUrl()}/watchlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; data?: unknown; error?: string };
    if (!resp.ok || !json.ok) throw new Error(json.error ?? `data service returned ${resp.status}`);
    return json.data;
  });
}
