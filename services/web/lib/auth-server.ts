/**
 * Better Auth server instance — the platform's identity + (later) OAuth
 * Authorization Server for the multi-tenant pivot (#P0). Runs in web (Next).
 *
 * Uses a neon-serverless WebSocket Pool (NOT web's neon-http db(), which can't do
 * transactions — Better Auth needs them for sign-up etc.). Auth tables live in the
 * shared Drizzle schema (`auth_*`), migrated via drizzle-kit like everything else.
 *
 * P0 = email/password identity. P2 adds the `mcp()` plugin → this instance is also
 * the OAuth 2.1 Authorization Server for the gated MCP endpoint (`/api/private/mcp`),
 * which Claude connects to via OAuth (DCR + PKCE). Social login can come later.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { mcp } from "better-auth/plugins";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { dbSchema } from "@qt/shared";

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing required env var: DATABASE_URL");
  return url;
}

function authSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET ?? process.env.DASHBOARD_SESSION_SECRET;
  if (!s || s.trim() === "") throw new Error("Missing required env var: BETTER_AUTH_SECRET");
  return s;
}

// Public base URL of the AS (OAuth metadata + the MCP resource identifier).
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
// The OAuth-gated MCP endpoint this AS protects (same origin). See app/api/private/mcp.
const mcpResource = `${baseURL}/api/private/mcp`;

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
  // mcp() makes this the OAuth 2.1 Authorization Server for the gated MCP endpoint
  // (#P2): authorize/token/consent/DCR/PKCE + discovery metadata. nextCookies() MUST
  // stay last — it sets cookies in Next server actions / route handlers.
  plugins: [mcp({ loginPage: "/sign-in", resource: mcpResource }), nextCookies()],
});
