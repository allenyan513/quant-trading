import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Guards every page and API route with the Better Auth session (multi-tenant).
 * Edge runtime → an OPTIMISTIC cookie-presence check only (getSessionCookie does
 * no DB call); real validation happens per-handler/page via getSession()
 * (lib/session.ts). Unauthenticated humans are sent to the public /landing;
 * unauthenticated API calls get 401.
 *
 * Public (no session needed): /landing, /sign-in, /sign-up, the Better Auth
 * endpoints (/api/auth/*), and /api/mcp (public market-data MCP).
 */
function isPublic(pathname: string): boolean {
  if (pathname === "/landing" || pathname === "/sign-in" || pathname === "/sign-up") return true;
  if (pathname === "/api/mcp") return true; // public MCP (public market data only)
  if (pathname.startsWith("/api/auth/")) return true; // Better Auth (own security)
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Optimistic: cookie present → let through (handlers validate fully).
  if (getSessionCookie(req)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/landing";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
