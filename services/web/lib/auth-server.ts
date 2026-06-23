/**
 * Better Auth server instance — the platform's identity + (later) OAuth
 * Authorization Server for the multi-tenant pivot (#P0). Runs in web (Next).
 *
 * Uses a neon-serverless WebSocket Pool (NOT web's neon-http db(), which can't do
 * transactions — Better Auth needs them for sign-up etc.). Auth tables live in the
 * shared Drizzle schema (`auth_*`), migrated via drizzle-kit like everything else.
 *
 * P0 = email/password identity. P2 adds the `mcp()` plugin → this instance is also
 * the OAuth 2.1 Authorization Server for the gated MCP endpoint (`/api/mcp`),
 * which Claude connects to via OAuth (DCR + PKCE). Social login can come later.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { mcp } from "better-auth/plugins";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { dbSchema } from "@qt/shared";

// `next build` evaluates this module (it backs the auth + OAuth routes) with
// NODE_ENV=production but WITHOUT the runtime env — so the module-load reads below
// must not throw at build time, or `next build` (collecting page data) dies. NEXT_PHASE
// marks the build: during it we return placeholders (the auth instance is constructed
// but never actually used while building) and enforce the real values at runtime.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  if (isBuildPhase) return "postgresql://build-placeholder/build";
  throw new Error("Missing required env var: DATABASE_URL");
}

function authSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (s && s.trim() !== "") return s;
  if (isBuildPhase) return "build-time-placeholder-secret";
  throw new Error("Missing required env var: BETTER_AUTH_SECRET");
}

// Public base URL of the AS (OAuth metadata + the MCP resource identifier). In prod
// this MUST be the real public URL — a silent localhost fallback would publish broken
// OAuth endpoints — so fail fast there; default to localhost in dev, and never throw
// during the build (env isn't present yet; the value is only needed at request time).
function resolveBaseURL(): string {
  const url = process.env.BETTER_AUTH_URL;
  if (url && url.trim() !== "") return url;
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error("Missing required env var: BETTER_AUTH_URL");
  }
  return "http://localhost:3001";
}
const baseURL = resolveBaseURL();
// The OAuth-gated MCP endpoint this AS protects (same origin). See app/api/mcp.
const mcpResource = `${baseURL}/api/mcp`;

// Google social login — only wired when both credentials are present, so a bare
// `next build` (no runtime env) doesn't construct a half-configured provider. The
// Google Cloud OAuth client must allow the redirect URI <origin>/api/auth/callback/google.
const googleCreds = (() => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
})();

// Module singleton — one pool per server instance (Cloud Run instances are long-lived).
const authPool = new Pool({ connectionString: databaseUrl() });
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
  secret: authSecret(),
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
  emailAndPassword: { enabled: true },
  ...(googleCreds ? { socialProviders: { google: googleCreds } } : {}),
  // Auto-link Google sign-in to an existing same-email account. Google verifies
  // emails, so this is safe; without it, signing in with Google for an email that
  // already has an email+password account errors `account_not_linked`.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      // Existing email+password accounts are unverified (no email-verification flow
      // yet), and requireLocalEmailVerified defaults true → it would block linking
      // Google onto them (`account_not_linked`). Off so Google sign-in links by its
      // (Google-verified) email. SECURITY: before opening password signup widely,
      // require email verification on signup OR go Google-only — otherwise someone
      // could pre-register an unverified password account on another user's email.
      requireLocalEmailVerified: false,
    },
  },
  // mcp() makes this the OAuth 2.1 Authorization Server for the gated MCP endpoint
  // (#P2): authorize/token/consent/DCR/PKCE + discovery metadata. nextCookies() MUST
  // stay last — it sets cookies in Next server actions / route handlers.
  plugins: [
    mcp({
      loginPage: "/sign-in",
      resource: mcpResource,
      // First connect shows our own consent screen (app/oauth/consent) where the user
      // clicks one Authorize button; Better Auth records the grant (auth_oauth_consent)
      // and skips consent on reconnect. loginPage is repeated here because OIDCOptions
      // requires it (the authorize handler reads consentPage/loginPage from this config).
      oidcConfig: { loginPage: "/sign-in", consentPage: "/oauth/consent" },
    }),
    nextCookies(),
  ],
});
