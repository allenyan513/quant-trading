/**
 * Server-side session helpers (Node runtime route handlers / Server Components).
 * Full, DB-validated session — distinct from the optimistic cookie check the
 * Edge middleware does. In P1b these become the source of `user_id` for scoping
 * per-user data (holdings, watchlist).
 */
import { headers } from "next/headers";
import { auth } from "@/lib/auth-server";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** The authenticated user, or null. */
export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/** The authenticated user id, or throw — for handlers that require auth. */
export async function requireUserId(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("unauthorized");
  return user.id;
}
