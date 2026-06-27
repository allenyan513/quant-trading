"use client";

import { Navigate, useSearchParams } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import { useLive } from "@/components/live";
import { ConsentForm } from "@/components/consent-form";

interface ConsentInfo {
  name: string;
  redirectHost: string;
}

/**
 * OAuth consent screen (core MCP flow). The gateway's authorize endpoint redirects the
 * (logged-in) user here as `/oauth/consent?consent_code=…&client_id=…&scope=…`. Converted
 * from web's server component: the client name comes from the gateway's `/consent-info`
 * read instead of a direct DB query.
 */
export default function ConsentPage() {
  const { data: session, isPending } = useSession();
  const [sp] = useSearchParams();
  const consentCode = sp.get("consent_code") ?? "";
  const clientId = sp.get("client_id") ?? "";
  const scope = sp.get("scope") ?? "";

  const { data: info } = useLive<ConsentInfo>(
    clientId ? `/api/consent-info?client_id=${encodeURIComponent(clientId)}` : (null as unknown as string),
  );

  if (isPending) return null;
  if (!session) return <Navigate to={`/sign-in?from=${encodeURIComponent(`/oauth/consent${window.location.search}`)}`} replace />;
  if (!consentCode || !clientId) return <Navigate to="/" replace />;

  return (
    <ConsentForm
      clientName={info?.name || "An MCP client"}
      redirectHost={info?.redirectHost ?? ""}
      scope={scope}
      consentCode={consentCode}
      userEmail={session.user.email}
    />
  );
}
