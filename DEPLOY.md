# Deploy — Cloud Run (backend + gateway) + Cloudflare Pages (SPA) + Neon

Four Cloud Run services + a static SPA on Cloudflare Pages + Neon Postgres + Cloud Scheduler.

```
Cloudflare Pages:  spa            ── apex  sweetvaluelab.com         (pure static; calls the gateway)
Cloud Run:         gateway (public)  ── api.sweetvaluelab.com  →  data  →  alpha  →  portfolio   (run.app URLs)
Cloud Scheduler:   drives the cron endpoints on data / alpha / portfolio
Neon:  DATABASE_URL   |   external APIs:  Anthropic, FMP
```

`gateway` is the **sole public API** (Better Auth OAuth 2.1 AS + Google login + the OAuth-gated
`/mcp` endpoint + all business routes; reads the DB read-only, forwards writes to data/portfolio).
`spa` is the **browser frontend** (Vite static, Cloudflare Pages). `data` / `alpha` / `portfolio`
are internal — for v1 deploy them `--allow-unauthenticated` so `deliverJson` works without OIDC
(lock down later, see "Hardening").

---

## Build path: CLI or Cloud Console (GUI)

Root Dockerfiles (`Dockerfile.data` / `.alpha` / `.portfolio` / `.gateway`) on purpose: each image
`COPY`s `packages/shared` + the lockfile, so the build context must be the **repo root**. The SPA is
**not** a Docker image — it builds via Vite and deploys to Cloudflare Pages (see §4).

**Cloud Console (GUI):** Cloud Run → Create service → *Continuously deploy from a repository* →
GitHub, branch `^main$` → Build type **Dockerfile**, location **`/Dockerfile.<service>`**. Set
container port **8080**, **Allow unauthenticated**, Min instances **1**, "CPU always allocated" for
data + alpha, env from §3. Deploy in order **portfolio → alpha → data → gateway** so each callee URL
exists before the caller sets it. **CLI:** the rest of this doc.

## 0. Prereqs

- `gcloud` CLI authed; a GCP project with billing. A Cloudflare account.
- Local Docker (amd64 — on Apple Silicon you MUST pass `--platform linux/amd64`).
- A Neon database + its pooled **read-write** `DATABASE_URL` (Better Auth writes sessions/tokens; the
  log sink writes `system_logs` — do NOT use a read-only role).
- `ANTHROPIC_API_KEY`, `FMP_API_KEY`.
- `BETTER_AUTH_SECRET` (random), a Google OAuth client (`GOOGLE_CLIENT_ID`/`SECRET`).
- Your two domains: apex `sweetvaluelab.com` (SPA) + `api.sweetvaluelab.com` (gateway).

```bash
# Fill these in, then `source` this block in your shell.
export PROJECT=your-gcp-project
export REGION=us-central1
export REPO=qt
export IMG=$REGION-docker.pkg.dev/$PROJECT/$REPO

export DATABASE_URL='postgresql://...neon-pooled...'     # read-write role
export ANTHROPIC_API_KEY='sk-ant-...'
export FMP_API_KEY='...'
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
export GOOGLE_CLIENT_ID='...apps.googleusercontent.com'
export GOOGLE_CLIENT_SECRET='...'
export APEX=https://sweetvaluelab.com                    # SPA origin
export API=https://api.sweetvaluelab.com                 # gateway origin

gcloud config set project $PROJECT
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com
gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION 2>/dev/null || true
gcloud auth configure-docker $REGION-docker.pkg.dev
```

## 1. Migrate the database (once, and on every schema change)

```bash
DATABASE_URL="$DATABASE_URL" pnpm db:migrate
```

(Idempotent — already-applied migrations are skipped. Auth/OAuth tables ship in the shared schema.)

## 2. Build & push the four images

```bash
for svc in data alpha portfolio gateway; do
  docker build --platform linux/amd64 -f Dockerfile.$svc -t $IMG/$svc:latest .
  docker push $IMG/$svc:latest
done
```

## 3. Deploy the backend + gateway (downstream-first, so no URL backfill)

```bash
COMMON="--region=$REGION --allow-unauthenticated --platform=managed"

# portfolio (no outbound HTTP; just DB). Needs JOB_TOKEN + HOLDINGS_ENC_KEY (IBKR sync, §6).
gcloud run deploy portfolio --image=$IMG/portfolio:latest $COMMON --min-instances=1 \
  --set-env-vars="DATABASE_URL=$DATABASE_URL"
export PORTFOLIO_URL=$(gcloud run services describe portfolio --region=$REGION --format='value(status.url)')

# alpha (LLM signal agent → portfolio). CPU-always-on for the async reprice.
gcloud run deploy alpha --image=$IMG/alpha:latest $COMMON --min-instances=1 --no-cpu-throttling \
  --set-env-vars="DATABASE_URL=$DATABASE_URL,FMP_API_KEY=$FMP_API_KEY,ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY,PORTFOLIO_URL=$PORTFOLIO_URL"
export ALPHA_URL=$(gcloud run services describe alpha --region=$REGION --format='value(status.url)')

# data (news ingest + triage agent → alpha). CPU-always-on for background triage.
gcloud run deploy data --image=$IMG/data:latest $COMMON --min-instances=1 --no-cpu-throttling \
  --set-env-vars="DATABASE_URL=$DATABASE_URL,FMP_API_KEY=$FMP_API_KEY,ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY,ALPHA_URL=$ALPHA_URL"
export DATA_URL=$(gcloud run services describe data --region=$REGION --format='value(status.url)')

# gateway (public: Better Auth + MCP + business routes; forwards writes to data/portfolio).
# BETTER_AUTH_URL = the gateway's own public origin; WEB_ORIGIN = the SPA's apex.
gcloud run deploy gateway --image=$IMG/gateway:latest $COMMON --min-instances=1 \
  --set-env-vars="DATABASE_URL=$DATABASE_URL,BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET,BETTER_AUTH_URL=$API,WEB_ORIGIN=$APEX,GATEWAY_CORS_ORIGINS=$APEX,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET,DATA_URL=$DATA_URL,PORTFOLIO_URL=$PORTFOLIO_URL"
```

> `PORT` is injected by Cloud Run (don't set it). `NODE_ENV=production` is baked into the image.
> The gateway needs `DATA_URL`/`PORTFOLIO_URL` to forward writes; reads hit the DB directly.

## 4. Deploy the SPA to Cloudflare Pages

Cloudflare Pages → Create project → connect the GitHub repo, **production branch `main`**, then:

- **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @qt/spa build`
- **Build output directory:** `services/spa/dist`
- **Root directory:** *(leave empty — pnpm installs the workspace at the repo root to resolve `@qt/shared`)*
- **Environment variables:** `VITE_API_URL=https://api.sweetvaluelab.com` · `NODE_VERSION=20`

SPA routing (deep links / refresh) works via `services/spa/public/_redirects` (`/* /index.html 200`),
which Vite copies into `dist`.

## 5. Custom domains, DNS, and Google OAuth

1. **Gateway domain:** Cloud Run → gateway → *Custom Domains* → map `api.sweetvaluelab.com`; follow
   the DNS record it gives you.
2. **SPA domain:** Cloudflare Pages → project → *Custom domains* → add `sweetvaluelab.com` (apex).
3. **Google OAuth redirect URI:** in the Google OAuth client, add **Authorized redirect URI**
   `https://api.sweetvaluelab.com/auth/callback/google` (the gateway's Better Auth callback; basePath
   `/auth`). Keep the localhost dev one too.

Cookies: apex + `api.` are same-site, so the gateway sets the session cookie on `.sweetvaluelab.com`
(`crossSubDomainCookies`, auto-enabled in prod) and the SPA sends it with `credentials: "include"`.

## 6. Cloud Scheduler (the cron contract)

```bash
TZ=America/New_York
mkjob() { gcloud scheduler jobs create http "$1" --location=$REGION --schedule="$2" \
  --time-zone=$TZ --uri="$3$4" --http-method=POST \
  --headers=Content-Type=application/json --message-body="${5:-{}}" 2>/dev/null \
  || gcloud scheduler jobs update http "$1" --location=$REGION --schedule="$2" \
  --time-zone=$TZ --uri="$3$4" --message-body="${5:-{}}"; }

mkjob data-news-pull   "0 9-17 * * 1-5"  "$DATA_URL" /news/pull  '{"days":1}'
mkjob data-news-triage "30 9-17 * * 1-5" "$DATA_URL" /news/triage
mkjob data-scan        "0 22 * * 1-5"    "$DATA_URL" /scan/earnings
mkjob data-redeliver   "*/5 * * * *"     "$DATA_URL" /internal/redeliver
mkjob alpha-reprocess  "*/5 * * * *"     "$ALPHA_URL" /internal/reprocess
mkjob alpha-redeliver  "*/5 * * * *"     "$ALPHA_URL" /internal/redeliver
mkjob portfolio-track  "*/30 9-16 * * 1-5" "$PORTFOLIO_URL" /jobs/track
```

The `JOB_TOKEN`-guarded `/jobs/*` endpoints are driven by **GitHub Actions**
(`.github/workflows/sync-{13f,earnings,holdings}.yml`) with a `Bearer $JOB_TOKEN` header. `sync-13f` +
`sync-earnings` hit **data** (`$DATA_URL`); `sync-holdings` hits **portfolio** (`$PORTFOLIO_URL`) — so
portfolio must ALSO have `JOB_TOKEN` + `HOLDINGS_ENC_KEY`. Set the `DATA_URL` / `PORTFOLIO_URL` /
`JOB_TOKEN` repo secrets to match.

## 7. Verify

```bash
curl -s $DATA_URL/health; curl -s $ALPHA_URL/health; curl -s $PORTFOLIO_URL/health
curl -s $API/health                                    # gateway
curl -s $API/.well-known/oauth-authorization-server    # issuer = $API, endpoints under /auth/mcp/*
curl -s -i $API/mcp                                    # → 401 + WWW-Authenticate (OAuth-gated)
open $APEX                                              # SPA homepage (static) → Sign in → Google → /workspace
# Connect a real Claude to $API/mcp → OAuth (DCR+PKCE+consent on the SPA) → tools/list
```

## Redeploy on code change

```bash
svc=gateway   # or data / alpha / portfolio
docker build --platform linux/amd64 -f Dockerfile.$svc -t $IMG/$svc:latest . && docker push $IMG/$svc:latest
gcloud run deploy $svc --image=$IMG/$svc:latest --region=$REGION
```

The **SPA** redeploys automatically on push to `main` (Cloudflare Pages). Schema change → rerun §1.

## Hardening (after it works — not v1)

- **Service-to-service auth (#24):** make `data`/`alpha`/`portfolio` private, grant each caller
  `roles/run.invoker`, attach an OIDC token in `deliverJson`. The gateway stays public.
- **Secrets:** move `DATABASE_URL` / `BETTER_AUTH_SECRET` / API keys into Secret Manager
  (`--set-secrets`).
- **CORS:** keep `GATEWAY_CORS_ORIGINS` pinned to the SPA apex (never `*` in prod).
- **Faster cold starts:** switch the backend images from `tsx` to a compiled `tsc → node dist` build.
- **Decouple background work:** Cloud Tasks / Pub/Sub for the in-process triage/reprice tasks.
