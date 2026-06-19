/**
 * Forward a GET to the data service and unwrap its ok()/fail() envelope. Used for
 * LIVE passthroughs (Discover market snapshots) where there's no DB to read — data
 * is the sole external receiver, so web proxies to it rather than calling FMP itself.
 * DATA_URL is read statically (Next inlines it; see lib/db.ts / candidates dismiss).
 */
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

export async function dataGet<T>(path: string): Promise<T> {
  const resp = await fetch(`${dataUrl()}${path}`);
  const json = (await resp.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } | string } | null;
  if (!resp.ok || !json?.ok) {
    const e = json?.error;
    throw new Error((typeof e === "object" ? e?.message : e) ?? `data ${path} returned ${resp.status}`);
  }
  return json.data as T;
}
