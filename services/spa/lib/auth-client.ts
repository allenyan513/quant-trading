/**
 * Better Auth browser client — used by the sign-in/sign-up forms, sign-out, and
 * `useSession`. Talks to the gateway's Better Auth at `${VITE_API_URL}/auth/*`
 * (the gateway runs Better Auth with basePath "/auth"). Cross-origin but same-site
 * (apex ↔ api subdomain), so `credentials: "include"` carries the session cookie.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL,
  basePath: "/auth",
  fetchOptions: { credentials: "include" },
});
export const { signIn, signUp, signOut, useSession } = authClient;
