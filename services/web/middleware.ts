import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth";

/**
 * Guards every page and API route. Unauthenticated requests are redirected to
 * /login (pages) or rejected with 401 (API). /login and the login API are open;
 * /api/mcp is open too — it's a public MCP endpoint (public market data only, no
 * private account tools), reached by third-party LLMs without the dashboard cookie.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isLoginPage = pathname === "/login";
  const isLoginApi = pathname === "/api/login";
  const isMcp = pathname === "/api/mcp"; // public MCP endpoint, not cookie-gated
  if (isLoginPage || isLoginApi || isMcp) return NextResponse.next();

  const ok = await verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
