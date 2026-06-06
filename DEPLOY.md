# Deploy — all on Google Cloud Run (+ Neon)

Four Cloud Run services + Neon Postgres + Cloud Scheduler. No Vercel.

```
Cloud Run:  web (public)  →  data  →  alpha  →  portfolio        (all run.app URLs)
Cloud Scheduler:  drives the cron endpoints on data / alpha / portfolio
Neon:  DATABASE_URL   |   external APIs:  Anthropic, FMP
```

`web` is public (browser-facing; protected by its own cookie+password login).
`data` / `alpha` / `portfolio` are internal — for v1 we deploy them
`--allow-unauthenticated` so `deliverJson` works without OIDC (lock down later,
see "Hardening").

---

## Build path: CLI or Cloud Console (GUI)

The Dockerfiles live at the **repo root** (`Dockerfile.data` / `.alpha` /
`.portfolio` / `.web`) on purpose: Cloud Run's "deploy from a repository" wizard
uses the Dockerfile's **directory** as the build context, but these images need
the repo root (they `COPY packages/shared` + the lockfile). Root Dockerfiles make
the wizard's context = repo root — otherwise the build fails at
`COPY pnpm-workspace.yaml ... file does not exist`.

**Cloud Console (GUI):** Cloud Run → Create service → *Continuously deploy from a
repository* → connect GitHub, branch `^main$` → Build type **Dockerfile**,
Dockerfile location **`/Dockerfile.<service>`** (e.g. `/Dockerfile.portfolio`).
Then set: container port **8080**, **Allow unauthenticated**, Min instances **1**,
"CPU is always allocated" for data + alpha, and the env vars from §3/§4. Repeat
per service in order **portfolio → alpha → data → web** so each callee URL exists
before you set `PORTFOLIO_URL`/`ALPHA_URL`/`DATA_URL` (edit env + deploy a new
revision if you go out of order). Cloud Build runs amd64, so no `--platform`
needed. You still run migrations (§1) and create Scheduler jobs (§5) yourself.

**CLI:** the rest of this doc.

## 0. Prereqs

- `gcloud` CLI authed; a GCP project with billing.
- Local Docker (building amd64 images — **on Apple Silicon you MUST pass
  `--platform linux/amd64`** or Cloud Run won't run the image).
- A Neon database + its pooled `DATABASE_URL`.
- `ANTHROPIC_API_KEY`, `FMP_API_KEY`.
- A dashboard password + a random session secret.

```bash
# Fill these in, then `source` this block in your shell.
export PROJECT=your-gcp-project
export REGION=us-central1
export REPO=qt                      # Artifact Registry repo name
export IMG=$REGION-docker.pkg.dev/$PROJECT/$REPO

export DATABASE_URL='postgresql://...neon-pooled...'
export ANTHROPIC_API_KEY='sk-ant-...'
export FMP_API_KEY='...'
export DASHBOARD_PASSWORD='choose-a-strong-one'
export DASHBOARD_SESSION_SECRET="$(openssl rand -hex 32)"

gcloud config set project $PROJECT
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com
gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION 2>/dev/null || true
gcloud auth configure-docker $REGION-docker.pkg.dev
```

## 1. Migrate the database (once, and on every schema change)

Drizzle migrations live in `packages/shared/drizzle/`. Apply them to prod Neon:

```bash
DATABASE_URL="$DATABASE_URL" pnpm db:migrate
```

(Runs `0000…0015`: creates the marketdata/event/triage tables etc. Idempotent —
already-applied migrations are skipped.)

## 2. Build & push the four images

Build context is the **repo root** (the Dockerfiles copy `packages/shared` + the
lockfile). `.dockerignore` keeps node_modules/.next out.

```bash
for svc in data alpha portfolio web; do
  docker build --platform linux/amd64 -f Dockerfile.$svc -t $IMG/$svc:latest .
  docker push $IMG/$svc:latest
done
```

## 3. Deploy the backend services (downstream-first, so no URL backfill)

Order matters: each service only needs the URL of the one it calls, so deploy
`portfolio → alpha → data` and capture each URL as you go.

```bash
COMMON="--region=$REGION --allow-unauthenticated --platform=managed"

# portfolio (no outbound HTTP; just DB). min-instances=1 so /jobs/track + any
# background work isn't cold every time.
gcloud run deploy portfolio --image=$IMG/portfolio:latest $COMMON --min-instances=1 \
  --set-env-vars="DATABASE_URL=$DATABASE_URL"
export PORTFOLIO_URL=$(gcloud run services describe portfolio --region=$REGION --format='value(status.url)')

# alpha (LLM signal agent; delivers to portfolio). CPU-always-on so the async
# background reprice survives after the 202 response.
gcloud run deploy alpha --image=$IMG/alpha:latest $COMMON --min-instances=1 --no-cpu-throttling \
  --set-env-vars="DATABASE_URL=$DATABASE_URL,FMP_API_KEY=$FMP_API_KEY,ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY,PORTFOLIO_URL=$PORTFOLIO_URL"
export ALPHA_URL=$(gcloud run services describe alpha --region=$REGION --format='value(status.url)')

# data (news ingest + triage agent; delivers to alpha). CPU-always-on for the
# background triage fired by /news/pull.
gcloud run deploy data --image=$IMG/data:latest $COMMON --min-instances=1 --no-cpu-throttling \
  --set-env-vars="DATABASE_URL=$DATABASE_URL,FMP_API_KEY=$FMP_API_KEY,ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY,ALPHA_URL=$ALPHA_URL"
export DATA_URL=$(gcloud run services describe data --region=$REGION --format='value(status.url)')
```

## 4. Deploy web (public dashboard)

```bash
gcloud run deploy web --image=$IMG/web:latest --region=$REGION --allow-unauthenticated --platform=managed \
  --min-instances=1 \
  --set-env-vars="DATABASE_URL=$DATABASE_URL,DATA_URL=$DATA_URL,DASHBOARD_SESSION_SECRET=$DASHBOARD_SESSION_SECRET,DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD"
export WEB_URL=$(gcloud run services describe web --region=$REGION --format='value(status.url)')
echo "Dashboard: $WEB_URL"
```

## 5. Cloud Scheduler (the cron contract)

Endpoints don't self-schedule — these jobs drive them. All times US/Eastern
(market day). Public services → no OIDC needed; for private, add
`--oidc-service-account-email=...`.

```bash
TZ=America/New_York
mkjob() { gcloud scheduler jobs create http "$1" --location=$REGION --schedule="$2" \
  --time-zone=$TZ --uri="$3$4" --http-method=POST \
  --headers=Content-Type=application/json --message-body="${5:-{}}" 2>/dev/null \
  || gcloud scheduler jobs update http "$1" --location=$REGION --schedule="$2" \
  --time-zone=$TZ --uri="$3$4" --message-body="${5:-{}}"; }

# data
mkjob data-news-pull   "0 9-17 * * 1-5"  "$DATA_URL" /news/pull  '{"days":1}'
mkjob data-news-triage "30 9-17 * * 1-5" "$DATA_URL" /news/triage
mkjob data-scan        "0 22 * * 1-5"    "$DATA_URL" /scan/earnings
mkjob data-expire      "0 6 * * *"       "$DATA_URL" /internal/expire-watchlist
mkjob data-redeliver   "*/5 * * * *"     "$DATA_URL" /internal/redeliver
# alpha
mkjob alpha-reprocess  "*/5 * * * *"     "$ALPHA_URL" /internal/reprocess
mkjob alpha-redeliver  "*/5 * * * *"     "$ALPHA_URL" /internal/redeliver
# portfolio — without this, open positions never close on stop/target/expiry
mkjob portfolio-track  "*/30 9-16 * * 1-5" "$PORTFOLIO_URL" /jobs/track
```

## 6. Verify

```bash
curl -s $DATA_URL/health; curl -s $ALPHA_URL/health; curl -s $PORTFOLIO_URL/health
open $WEB_URL                          # log in with DASHBOARD_PASSWORD
curl -s -X POST $DATA_URL/news/pull -H 'content-type: application/json' -d '{"days":1}'
# → watch data logs: news.pull.done then triage.agent.* (background)
gcloud run services logs read data --region=$REGION --limit=50
```

## Redeploy on code change

```bash
svc=data   # or alpha / portfolio / web
docker build --platform linux/amd64 -f Dockerfile.$svc -t $IMG/$svc:latest . && docker push $IMG/$svc:latest
gcloud run deploy $svc --image=$IMG/$svc:latest --region=$REGION
```

Schema change → also rerun step 1 (`pnpm db:migrate`) before deploying.

## Hardening (after it works — not v1)

- **Service-to-service auth (#24):** make `data`/`alpha`/`portfolio` private
  (drop `--allow-unauthenticated`), grant each caller's service account
  `roles/run.invoker` on its callee, and attach an OIDC token in `deliverJson`
  (`packages/shared/src/http.ts`). Scheduler jobs then need
  `--oidc-service-account-email`.
- **Secrets:** move `DATABASE_URL` / API keys into Secret Manager and reference
  with `--set-secrets` instead of `--set-env-vars`.
- **Faster cold starts / cheaper:** switch the backend images from `tsx` to a
  compiled build (`tsc` → `node dist`, point `@qt/shared` exports at `dist/`).
- **Decouple background work:** replace the in-process `void` background tasks
  (data triage, alpha reprice) with Cloud Tasks / Pub/Sub for guaranteed
  execution; the `/internal/*` sweeps stay as the backstop.
