# Quant Trading System

An event-driven, distributed quant-trading system built around three internal HTTP
services (data → alpha → portfolio), a public API gateway (auth + MCP + business routes,
forwarding writes to the internal services), and a pure frontend SPA.

```
news → data (screen + triage + cache warm) → (event) → alpha (reprice) → (signal) → portfolio (sizing + open/close)
```

**Stack:** TypeScript · Hono · Neon (Postgres) · Drizzle · Anthropic SDK (Messages
API, not the Agent SDK). pnpm workspaces monorepo. Deploys to Cloud Run; runs locally
via tsx or Docker Compose.

Coding rules live in `.claude/rules/` (auto-loaded per directory); the schema source
of truth is `packages/shared/src/db/schema.ts`. Design discussion, roadmap, and task
status are tracked in **GitHub issues** — not in `docs/`.

## Services

- **`packages/shared`** — domain types, response envelope, lazy config, db (schema +
  client), FMP client, and HTTP utilities. Consumed by every service as the `@qt/shared`
  workspace dependency.
- **`services/data`** — the sole receiver of external data, **news-driven** (#59):
  `/news/pull` ingests market news, then auto-triages new rows (deterministic profile
  screen → cache warm → a single lightweight Haiku LLM grades high/med/low). Also hosts
  a deterministic reference-valuation engine, per-user watchlist, stock-discovery
  scanners, quarterly 13F holdings, and the symbol-centric SEC trio (13D/13G ownership,
  8-K events, Form 4 insiders) — all sourced directly from SEC EDGAR.
- **`services/alpha`** — the single pricing/decision LLM agent: event → reprice →
  trade signal, reading data's pre-warmed caches.
- **`services/portfolio`** — sole owner of the `portfolio_positions` ledger, no LLM:
  records signals → deterministic sizing to open → `/jobs/track` settles closes on
  stop-loss / take-profit / expiry.
- **`services/gateway`** — Hono API gateway and the **only public entry point** (Cloud Run,
  `api.` subdomain): Better Auth (OAuth 2.1 AS), an **OAuth-gated MCP endpoint** (`/mcp`) for
  users' own Claude, and all business routes (read-only DB reads + writes forwarded to data /
  portfolio). Public MCP tools expose research / 13F; private `get_holdings` / `get_watchlist` /
  paper / memo are scoped to the token's user (tenant isolation). data / alpha / portfolio stay internal.
- **`services/spa`** — Vite + React + React Router single-page app (Cloudflare Pages, apex
  domain). Talks only to the gateway (cookie session, same-site subdomains); no server logic.

## Local development

```bash
pnpm install
cp .env.example .env          # DATABASE_URL, ANTHROPIC_API_KEY, FMP_API_KEY, …

pnpm db:generate && pnpm db:migrate

pnpm dev                      # all services with hot reload
pnpm dev:gateway              # gateway    → :8081
pnpm dev:data                 # data       → :8082
pnpm dev:alpha                # alpha      → :8083
pnpm dev:portfolio            # portfolio  → :8084
pnpm dev:spa                  # spa (Vite) → :3001

pnpm typecheck                # tsc --noEmit across the repo; run before committing
pnpm test                     # vitest (pure-function units; no FMP/DB)

pnpm up / pnpm down           # full stack via Docker Compose
```

## Status

The loop is closed: data ingests news → screens, triages, and warms caches → alpha
reprices into signals → portfolio sizes and opens positions, then `/jobs/track` settles
closes; the SPA dashboard (served by the gateway) provides read-only monitoring and manual triage review.
Work in progress and the roadmap live in **GitHub issues**.
