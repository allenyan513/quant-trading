import { param, intParam } from "@/lib/api";
import { authedRoute, readBody } from "@/lib/route";
import { listMemos } from "@qt/shared/memo-read";
import { dataPost } from "@/lib/data-proxy";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the signed-in user's memos (array, for LiveTable). Body omitted; filter by
 *  symbol / type / status. */
export const GET = authedRoute((uid, req) =>
  listMemos(db(), uid, {
    symbol: param(req, "symbol"),
    type: param(req, "type"),
    status: param(req, "status"),
    limit: intParam(req, "limit"),
    includeBody: false,
  }),
);

/** Create a memo. The data service owns the table + computes the PIT snapshot; web forwards. */
export const POST = authedRoute(async (uid, req) => {
  const body = await readBody<{ type?: string; title?: string; markdown?: string; symbols?: string[]; direction?: string; status?: string }>(req);
  const title = (body.title ?? "").trim();
  if (!title) throw new Error("title required");
  const markdown = (body.markdown ?? "").trim();
  if (!markdown) throw new Error("markdown required");
  return dataPost("/memos/submit", {
    userId: uid,
    type: body.type,
    title,
    markdown,
    symbols: Array.isArray(body.symbols) ? body.symbols : undefined,
    direction: body.direction,
    status: body.status,
  });
});
