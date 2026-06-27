/**
 * Better Auth instance for the API gateway — the platform's identity provider AND the
 * OAuth 2.1 Authorization Server for the gated MCP endpoint (`/mcp`).
 *
 * Ported from web's `lib/auth-server.ts`. Differences for the standalone Hono gateway:
 *  - Plain Node (tsx/Docker), NOT Next: no `next build` module-eval phase that imports
 *    this without env, so the `NEXT_PHASE` build guard is gone, env is read via
 *    `config.*()`, and the Pool + instance are built EAGERLY (fail-fast on missing env
 *    at startup, which is what we want). One pool per long-lived Cloud Run instance.
 *  - `nextCookies()` plugin DROPPED (Next-only — it set cookies in server actions);
 *    Hono returns the `auth.handler` Response directly, which carries Set-Cookie.
 *  - `bearer()` plugin ADDED — issues/accepts `Authorization: Bearer` for the web SPA
 *    and native clients (the human token path; consumed by PR4's SPA).
 *  - The MCP resource is now `${BETTER_AUTH_URL}/mcp` (rootless on the api subdomain),
 *    and the OAuth login/consent pages live on the SPA (absolute `${WEB_ORIGIN}/...`).
 *
 * Uses a neon-serverless WebSocket Pool (NOT the gateway's read-only neon-http `db()` —
 * Better Auth needs transactions). Auth/OAuth tables live in the shared Drizzle schema.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { mcp } from "better-auth/plugins";
import { bearer } from "better-auth/plugins/bearer";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { config, dbSchema } from "@qt/shared";

// Public base URL of the AS (OAuth metadata + the MCP resource identifier). On the
// gateway this is the api subdomain, e.g. https://api.sweetvaluelab.com.
const baseURL = config.betterAuthUrl();
// The OAuth-gated MCP endpoint this AS protects (same origin, rootless path).
const mcpResource = `${baseURL}/mcp`;
// The SPA origin (apex) that hosts the human-facing login + OAuth consent pages.
const webOrigin = config.webOrigin();

// Google social login — only wired when both credentials are present.
const googleCreds = (() => {
  const clientId = config.googleClientId();
  const clientSecret = config.googleClientSecret();
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
})();

// Module singleton — one WebSocket Pool per long-lived server instance.
const authPool = new Pool({ connectionString: config.databaseUrl() });
const authDb = drizzle(authPool, {
  schema: {
    authUser: dbSchema.authUser,
    authSession: dbSchema.authSession,
    authAccount: dbSchema.authAccount,
    authVerification: dbSchema.authVerification,
    oauthApplication: dbSchema.oauthApplication,
    oauthAccessToken: dbSchema.oauthAccessToken,
    oauthConsent: dbSchema.oauthConsent,
  },
});

export const auth = betterAuth({
  appName: "quant-trading",
  baseURL,
  // Rootless on the api subdomain: routes at /auth/* (web used the default /api/auth).
  // The OAuth + discovery URLs derive from baseURL + basePath, so they stay consistent.
  basePath: "/auth",
  secret: config.betterAuthSecret(),
  trustedOrigins: [webOrigin],
  database: drizzleAdapter(authDb, {
    provider: "pg",
    // Map Better Auth's models to our prefixed tables.
    schema: {
      user: dbSchema.authUser,
      session: dbSchema.authSession,
      account: dbSchema.authAccount,
      verification: dbSchema.authVerification,
      oauthApplication: dbSchema.oauthApplication,
      oauthAccessToken: dbSchema.oauthAccessToken,
      oauthConsent: dbSchema.oauthConsent,
    },
  }),
  // Password SIGN-IN stays on (existing accounts), but SIGN-UP is disabled — new
  // accounts come only from Google. Closes the pre-registration account-takeover
  // hole (#160 review): no way to plant an unverified password account.
  emailAndPassword: { enabled: true, disableSignUp: true },
  ...(googleCreds ? { socialProviders: { google: googleCreds } } : {}),
  // Auto-link Google sign-in to an existing same-email account. Google verifies
  // emails, so this is safe. requireLocalEmailVerified stays false because password
  // sign-up is disabled (no attacker-planted unverified local account to link onto).
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      requireLocalEmailVerified: false,
    },
  },
  // Cross-subdomain session cookie so the SPA (apex) and gateway (api subdomain) share
  // one session. Enabled only when WEB_ORIGIN is a real domain (prod) — on localhost the
  // host is cookie-shared across ports already, and a ".localhost" domain breaks it.
  ...(webOrigin.includes("localhost")
    ? {}
    : {
        advanced: {
          crossSubDomainCookies: {
            enabled: true,
            domain: `.${new URL(webOrigin).hostname.split(".").slice(-2).join(".")}`,
          },
        },
      }),
  // mcp() = OAuth 2.1 AS for the gated MCP endpoint: authorize/token/consent/DCR/PKCE
  // + discovery metadata. bearer() issues/accepts Authorization: Bearer for the SPA +
  // native human-token path. The login + consent pages are React pages on the SPA, so
  // the AS redirects to absolute apex URLs.
  plugins: [
    mcp({
      loginPage: `${webOrigin}/sign-in`,
      resource: mcpResource,
      oidcConfig: { loginPage: `${webOrigin}/sign-in`, consentPage: `${webOrigin}/oauth/consent` },
    }),
    bearer(),
  ],
});
