import { deliverJson } from "@qt/shared";
import { handle } from "@/lib/api";

export const runtime = "nodejs";

// Read INGESTION_URL via static process.env access (Next inlines it at build,
// same as lib/db.ts reads DATABASE_URL). NOTE: config.ingestionUrl() from
// @qt/shared can't be used here — its requireEnv does a *dynamic* process.env[name]
// lookup, which Next does NOT inline, so it reads empty in the route runtime.
// Resolved inside the handler so a missing var fails per-request, not at build.
function ingestionUrl(): string {
  const u = process.env.INGESTION_URL;
  if (!u) throw new Error("Missing required env var: INGESTION_URL");
  return u;
}

/** Promote a candidate into the watchlist. ingestion owns the write, so this
 *  just forwards (web stays read-only on the DB). Auth'd by the dashboard cookie. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string };
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new Error("symbol required");
    const res = await deliverJson(`${ingestionUrl()}/candidates/promote`, { symbol });
    if (!res.ok) throw new Error(res.error ?? `ingestion returned ${res.status}`);
    return { symbol, promoted: true };
  });
}
