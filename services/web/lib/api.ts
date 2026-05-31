import { NextResponse } from "next/server";

/** Wrap a route handler: run it, JSON-ify the result, 500 on throw. */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Read a trimmed query-string value, or undefined if blank/missing. */
export function param(req: Request, name: string): string | undefined {
  const v = new URL(req.url).searchParams.get(name);
  const t = v?.trim();
  return t ? t : undefined;
}

export function intParam(req: Request, name: string): number | undefined {
  const v = param(req, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
