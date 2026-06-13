import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth";

/**
 * Guards every page and API route. Unauthenticated requests are redirected to
 * /login (pages) or rejected with 401 (API). /login and the login API are open.
 * Service callers (e.g. data's /mcp proxy) authenticate to the read-only /api/*
 * with an `Authorization: Bearer <JOB_TOKEN>` header instead of the dashboard
 * cookie.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isLoginPage = pathname === "/login";
  const isLoginApi = pathname === "/api/login";
  if (isLoginPage || isLoginApi) return NextResponse.next();

  // Service-to-service access to the read-only API. With a JOB_TOKEN configured,
  // require a matching bearer; with none configured, open /api/* in dev only
  // (stays locked in prod) so a fresh local checkout works without extra setup.
  const jobToken = process.env.JOB_TOKEN;
  if (
    pathname.startsWith("/api/") &&
    (jobToken
      ? req.headers.get("authorization") === `Bearer ${jobToken}`
      : process.env.NODE_ENV !== "production")
  ) {
    return NextResponse.next();
  }

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
