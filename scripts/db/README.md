# DB roles — least-privilege (Phase A RLS hardening)

Until now every service connected as the Neon **owner** role. Phase A splits that
into three least-privilege login roles, so the surfaces that take user / MCP input
can't write or read secrets. (Full per-row Row-Level Security is Phase B — see the
tracking issue.)

| Role | Used by | Privilege |
|---|---|---|
| `qt_web_ro` | web dashboard + OAuth MCP **reads** (`services/web/lib/db.ts`) | `SELECT` only; **cannot** read `data_holdings_accounts.flex_token`; no writes |
| `qt_auth_rw` | Better Auth in web (`services/web/lib/auth-server.ts`) | DML on the seven `auth_*` tables only |
| `qt_service_rw` | data / alpha / portfolio (`@qt/shared` pg Pool) | DML on `data_*` / `alpha_*` / `portfolio_*` / `system_*` |
| `neondb_owner` (existing) | migrations + `db:grants` only | full owner |

## Apply

### 1. Create the roles + passwords (once, out-of-band — secrets never go in git)

Run as the owner in the Neon SQL console (or `psql "$DATABASE_URL"`). Use Neon-generated
or strong random passwords; they land **only** in deploy env + your local `.env`:

```sql
CREATE ROLE qt_web_ro     LOGIN PASSWORD '<gen>';
CREATE ROLE qt_auth_rw    LOGIN PASSWORD '<gen>';
CREATE ROLE qt_service_rw LOGIN PASSWORD '<gen>';
```

> `grants.sql` also creates these roles `NOLOGIN` if missing, so `db:grants` never
> fails on a fresh DB — but a role needs `LOGIN PASSWORD` to be used in a connection
> string, so do this step. Re-running with the roles already present is a no-op.

### 2. Apply the grants (idempotent, as owner)

```bash
DATABASE_URL=<owner-url> pnpm db:grants     # runs scripts/db/grants.sql
```

Re-run after adding a new **role**. New **tables** are covered automatically by the
`ALTER DEFAULT PRIVILEGES` in `grants.sql`. If a new **encrypted column** is ever added
(today only `flex_token`), extend the carve-out block in `grants.sql`.

### 3. Wire each runtime's connection string

Same `DATABASE_URL` var name, different role per runtime (no app code reads a role name):

| Runtime | env | role |
|---|---|---|
| web | `DATABASE_URL_WEB` | `qt_web_ro` |
| web | `DATABASE_URL` | `qt_auth_rw` (Better Auth) |
| data / alpha / portfolio | `DATABASE_URL` | `qt_service_rw` |
| migrations / `db:grants` (dev/CI) | `DATABASE_URL` | owner |

Locally you can leave `DATABASE_URL_WEB` unset — `lib/db.ts` falls back to `DATABASE_URL`,
so a single owner URL keeps working.

## Verify (psql, as each role)

```sql
-- qt_web_ro: reads OK, secret + writes denied
SELECT 1 FROM data_watchlist LIMIT 1;                               -- ✅
SELECT flex_token FROM data_holdings_accounts LIMIT 1;             -- ❌ permission denied
SELECT account_id, flex_query_id FROM data_holdings_accounts LIMIT 1; -- ✅
INSERT INTO data_watchlist (user_id, symbol) VALUES ('x','x');    -- ❌ permission denied

-- qt_service_rw: app DML OK, not owner
INSERT INTO data_watchlist (user_id, symbol) VALUES ('smoke','SMOKE'); -- ✅ (clean up after)
CREATE TABLE _nope (x int);                                        -- ❌ permission denied

-- qt_auth_rw: auth DML OK, data_* denied
SELECT 1 FROM auth_user LIMIT 1;                                   -- ✅
INSERT INTO data_watchlist (user_id, symbol) VALUES ('x','x');    -- ❌ permission denied
```

## Rollback

Point web's `DATABASE_URL_WEB` back to the owner URL (or unset it) — instant revert,
no schema change. The grants are additive and never touch data.
