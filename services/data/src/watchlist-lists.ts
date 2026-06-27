/**
 * Per-user watchlist groups (data_watchlist_lists) + symbol→list assignment.
 * data owns the tables (T12); the gateway forwards create/rename/delete/assign here with
 * the session user's id. Pure user CRUD, no pipeline role.
 */
import { and, asc, eq } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";

const { watchlist, watchlistLists } = dbSchema;

export async function createList(userId: string, name: string): Promise<{ id: string; name: string }> {
  const uid = userId.trim();
  const nm = name.trim();
  if (!uid || !nm) throw new Error("userId and name are required");
  const [row] = await db()
    .insert(watchlistLists)
    .values({ userId: uid, name: nm })
    .returning({ id: watchlistLists.id, name: watchlistLists.name });
  if (!row) throw new Error("failed to create list");
  return row;
}

export async function renameList(userId: string, id: string, name: string): Promise<{ id: string; name: string }> {
  const uid = userId.trim();
  const nm = name.trim();
  if (!uid || !id || !nm) throw new Error("userId, id and name are required");
  const [row] = await db()
    .update(watchlistLists)
    .set({ name: nm })
    .where(and(eq(watchlistLists.id, id), eq(watchlistLists.userId, uid)))
    .returning({ id: watchlistLists.id, name: watchlistLists.name });
  if (!row) throw new Error("list not found");
  return row;
}

export async function deleteList(userId: string, id: string): Promise<{ id: string }> {
  const uid = userId.trim();
  if (!uid || !id) throw new Error("userId and id are required");
  // A list is a container: deleting it cascade-deletes its member symbols (FK on delete
  // cascade, #199). Deleting the last list is allowed — the SPA re-ensures a Favorite.
  await db().delete(watchlistLists).where(and(eq(watchlistLists.id, id), eq(watchlistLists.userId, uid)));
  return { id };
}

/** Guarantee the user has at least one list and return a default target — their first
 *  list (by tab order), or a freshly-created "Favorite". Idempotent. Every watchlist
 *  symbol needs a list, so a brand-new user (or one who deleted all their lists) gets a
 *  Favorite home automatically (#199). */
export async function ensureDefaultList(userId: string): Promise<{ id: string; name: string }> {
  const uid = userId.trim();
  if (!uid) throw new Error("userId is required");
  const [existing] = await db()
    .select({ id: watchlistLists.id, name: watchlistLists.name })
    .from(watchlistLists)
    .where(eq(watchlistLists.userId, uid))
    .orderBy(asc(watchlistLists.sortOrder), asc(watchlistLists.createdAt))
    .limit(1);
  if (existing) return existing;
  return createList(uid, "Favorite");
}

/** Resolve the list a write should target: the requested one if the user owns it,
 *  otherwise their default (Favorite, auto-created). Never null (#199). */
export async function resolveListId(userId: string, requested?: string | null): Promise<string> {
  const uid = userId.trim();
  if (requested) {
    const [own] = await db()
      .select({ id: watchlistLists.id })
      .from(watchlistLists)
      .where(and(eq(watchlistLists.id, requested), eq(watchlistLists.userId, uid)))
      .limit(1);
    if (own) return own.id;
  }
  return (await ensureDefaultList(uid)).id;
}

export async function assignToList(
  userId: string,
  symbol: string,
  listId: string,
): Promise<{ symbol: string; listId: string }> {
  const uid = userId.trim();
  const sym = symbol.trim().toUpperCase();
  if (!uid || !sym) throw new Error("userId and symbol are required");
  if (!listId) throw new Error("listId is required"); // no ungrouped state (#199)
  // Tenant guard: only assign to a list this user owns.
  const [own] = await db()
    .select({ id: watchlistLists.id })
    .from(watchlistLists)
    .where(and(eq(watchlistLists.id, listId), eq(watchlistLists.userId, uid)))
    .limit(1);
  if (!own) throw new Error("list not found");
  await db().update(watchlist).set({ listId }).where(and(eq(watchlist.userId, uid), eq(watchlist.symbol, sym)));
  return { symbol: sym, listId };
}

export async function reorderLists(userId: string, ids: string[]): Promise<{ count: number }> {
  const uid = userId.trim();
  if (!uid) throw new Error("userId is required");
  // Persist the new tab order as sortOrder = index. Scoped to the user's own lists;
  // ids that aren't theirs simply match nothing. Few lists per user → a small loop is fine.
  let i = 0;
  for (const id of ids) {
    await db()
      .update(watchlistLists)
      .set({ sortOrder: i })
      .where(and(eq(watchlistLists.id, id), eq(watchlistLists.userId, uid)));
    i++;
  }
  return { count: ids.length };
}

export async function listLists(userId: string): Promise<Array<{ id: string; name: string; sortOrder: number }>> {
  const uid = userId.trim();
  if (!uid) throw new Error("userId is required");
  return db()
    .select({ id: watchlistLists.id, name: watchlistLists.name, sortOrder: watchlistLists.sortOrder })
    .from(watchlistLists)
    .where(eq(watchlistLists.userId, uid))
    .orderBy(asc(watchlistLists.sortOrder), asc(watchlistLists.createdAt));
}
