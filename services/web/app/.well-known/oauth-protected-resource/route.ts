import { auth } from "@/lib/auth-server";
import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protected Resource Metadata (RFC 9728) for the gated MCP endpoint — points Claude
// at this app's Authorization Server (same origin). Served by Better Auth's mcp()
// plugin. The gated endpoint also emits this URL in its 401 WWW-Authenticate header.
const prm = oAuthProtectedResourceMetadata(auth);

export async function GET(req: Request) {
  return prm(req);
}
