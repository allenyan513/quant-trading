/**
 * Better Auth server instance — the platform's identity + (later) OAuth
 * Authorization Server for the multi-tenant pivot (#P0). Runs in web (Next).
 *
 * Uses a neon-serverless WebSocket Pool (NOT web's neon-http db(), which can't do
 * transactions — Better Auth needs them for sign-up etc.). Auth tables live in the
 * shared Drizzle schema (`auth_*`), migrated via drizzle-kit like everything else.
 *
 * P0 = email/password only. Social (Google) + the MCP OAuth-provider plugin come
 * in later phases. The old single-password gate (lib/auth.ts) stays live until P1
 * swaps the middleware, so this is purely additive.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
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

// Module singleton — one pool per server instance (Cloud Run instances are long-lived).
const authPool = new Pool({ connectionString: databaseUrl() });
const authDb = drizzle(authPool, {
  schema: {
    authUser: dbSchema.authUser,
    authSession: dbSchema.authSession,
    authAccount: dbSchema.authAccount,
    authVerification: dbSchema.authVerification,
  },
});

export const auth = betterAuth({
  appName: "quant-trading",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  secret: authSecret(),
  database: drizzleAdapter(authDb, {
    provider: "pg",
    // Map Better Auth's models to our prefixed tables.
    schema: {
      user: dbSchema.authUser,
      session: dbSchema.authSession,
      account: dbSchema.authAccount,
      verification: dbSchema.authVerification,
    },
  }),
  emailAndPassword: { enabled: true },
  // nextCookies() MUST be last — it makes Better Auth set cookies in Next server
  // actions / route handlers.
  plugins: [nextCookies()],
});
