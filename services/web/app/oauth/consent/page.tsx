import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { oauthApplication } from "@qt/shared/db";
import { getUser } from "@/lib/session";
import { ConsentForm } from "@/components/consent-form";

/**
 * OAuth consent screen (#core MCP flow). Better Auth's authorize endpoint redirects
 * the (now logged-in) user here as `/oauth/consent?consent_code=…&client_id=…&scope=…`
 * the first time a client (Claude) connects. We name the client + show what it gets;
 * the user clicks one Authorize button → POST /api/auth/oauth2/consent → redirect back
 * to Claude. The grant is remembered (auth_oauth_consent), so reconnects skip this.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ consent_code?: string; client_id?: string; scope?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in"); // authorize normally logs them in first; defensive
  const { consent_code, client_id, scope } = await searchParams;
  if (!consent_code || !client_id) redirect("/"); // not a valid consent request

  // Read-only lookup of the requesting client for a human name + its redirect host.
  let clientName = "An MCP client";
  let redirectHost = "";
  const rows = await db()
    .select({ name: oauthApplication.name, redirectUrls: oauthApplication.redirectUrls })
    .from(oauthApplication)
    .where(eq(oauthApplication.clientId, client_id))
    .limit(1);
  const app = rows[0];
  if (app?.name) clientName = app.name;
  if (app?.redirectUrls) {
    try {
      redirectHost = new URL(app.redirectUrls.split(/[\s,]+/)[0] ?? "").host;
    } catch {
      /* unparseable redirect — omit the host line */
    }
  }

  return (
    <ConsentForm
      clientName={clientName}
      redirectHost={redirectHost}
      scope={scope ?? ""}
      consentCode={consent_code}
      userEmail={user.email}
    />
  );
}
