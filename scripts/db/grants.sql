-- Phase A RLS hardening — least-privilege DB roles.
--
-- Idempotent. Run as the DB owner (neondb_owner) via `pnpm db:grants`.
-- Roles are created here WITHOUT login/password (no secrets in git); grant
-- LOGIN + PASSWORD out-of-band (Neon console / psql, see scripts/db/README.md),
-- then point each runtime's connection string at the matching role.
--
-- This lives OUTSIDE the Drizzle migration chain on purpose: grants/roles are
-- not modeled by Drizzle snapshots, so they would not survive `db:generate`.
-- Re-run after adding a new ROLE (new TABLES are covered by ALTER DEFAULT
-- PRIVILEGES below). Statements run top-to-bottom every time, so the column
-- carve-out on data_holdings_accounts always converges to the safe state.

-- 1. Ensure the three roles exist (NOLOGIN scaffolding — password added later).
DO $$ BEGIN CREATE ROLE qt_web_ro     NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE qt_auth_rw    NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE qt_service_rw NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. qt_web_ro — web dashboard + OAuth MCP read path (services/web/lib/db.ts).
--    SELECT on everything, EXCEPT the encrypted IBKR secret column.
GRANT USAGE ON SCHEMA public TO qt_web_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO qt_web_ro;
-- Hide data_holdings_accounts.flex_token: drop the table-level SELECT (which
-- covers all columns) and re-grant only the non-secret columns. NOTE: this
-- carve-out is table-specific — if a new encrypted column is ever added, extend
-- this block.
REVOKE SELECT ON data_holdings_accounts FROM qt_web_ro;
GRANT SELECT (account_id, flex_query_id, label, updated_at) ON data_holdings_accounts TO qt_web_ro;
-- Future owner-created tables auto-grant SELECT to the read-only role.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO qt_web_ro;

-- 3. qt_service_rw — data / alpha / portfolio services (packages/shared pg Pool).
--    Full DML on all app tables (+ sequences for serial PKs).
GRANT USAGE ON SCHEMA public TO qt_service_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qt_service_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO qt_service_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qt_service_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO qt_service_rw;

-- 4. qt_auth_rw — Better Auth in web (services/web/lib/auth-server.ts pool).
--    DML scoped to the seven auth_* tables only; NO access to data_* / alpha_* /
--    portfolio_*. web does no other direct DB writes (business writes forward to
--    the data service, T12).
GRANT USAGE ON SCHEMA public TO qt_auth_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  auth_user,
  auth_session,
  auth_account,
  auth_verification,
  auth_oauth_application,
  auth_oauth_access_token,
  auth_oauth_consent
  TO qt_auth_rw;
