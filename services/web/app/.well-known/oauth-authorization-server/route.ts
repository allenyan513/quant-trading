import { auth } from "@/lib/auth-server";
import { oAuthDiscoveryMetadata } from "better-auth/plugins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OAuth 2.1 Authorization Server metadata (RFC 8414). Claude discovers the AS here
// after reading the gated MCP endpoint's Protected Resource Metadata. Served by
// Better Auth's mcp() plugin (web is the AS).
const discovery = oAuthDiscoveryMetadata(auth);

export async function GET(req: Request) {
  return discovery(req);
}
