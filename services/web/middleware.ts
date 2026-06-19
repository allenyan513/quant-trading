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
 * endpoints (/api/auth/*), the OAuth discovery metadata (/.well-known/*), and the
 * MCP endpoint /api/mcp — OAuth-gated, but its auth runs in-handler via withMcpAuth
 * (not the dashboard session cookie), so middleware must let it through.
 */
/**
 * Vulnerability-scanner background noise: PHP/ASP/JSP files, WordPress paths,
 * and dotfile fishing (.env/.git/.aws/.ssh) that a Next.js app never serves.
 * Short-circuit these with a terse 404 BEFORE the auth/redirect logic so we
 * don't amplify a probe into a /landing redirect — one clean 404 in the logs
 * instead of a redirect chain. (This runs in-process on Cloud Run, so it does
 * NOT keep the request off the container; that's the edge WAF's job. It only
 * trims work + log noise.) Must NOT catch the real "/.well-known/*" OAuth
 * discovery paths — we match specific dotfiles, not every leading dot.
 */
const SCANNER_PROBE =
  /\.(php\d?|phtml|aspx?|jsp|cgi|sql|bak)$|\/(wp-(admin|login|content|includes|json)|xmlrpc|phpmyadmin|cgi-bin)\b|\/\.(env|git|aws|ssh)\b/i;

function isPublic(pathname: string): boolean {
  if (pathname === "/landing" || pathname === "/sign-in" || pathname === "/sign-up") return true;
  if (pathname === "/api/mcp") return true; // OAuth-gated MCP — auth runs in-handler (withMcpAuth)
  if (pathname.startsWith("/api/auth/")) return true; // Better Auth (own security)
  if (pathname.startsWith("/.well-known/")) return true; // OAuth discovery metadata (AS + PRM)
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (SCANNER_PROBE.test(pathname)) return new NextResponse(null, { status: 404 });
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
