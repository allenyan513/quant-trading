# data — external cron contract (#23)

The data service has no in-process scheduler. Its `/news/*`, `/scan/*` and
`/internal/*` endpoints are the canonical job definitions; an **external cron**
drives them on a schedule. This was a deliberate choice:

- The HTTP endpoints are already the single source of truth for "what a job
  does" — an in-process timer would just call the same code behind an env flag.
- Cloud Run scales to zero, where in-process timers are unreliable; an external
  scheduler hitting HTTP works for both persistent (docker-compose/VM) and
  scale-to-zero deploys.
- News ingestion is the sole entry trigger (the per-source `/pull/*` triggers
  were removed). Staging dedups on `(category, external_id)`, so ticks are
  idempotent — a missed or double-fired tick neither loses nor duplicates rows.

## The contract

[`data.crontab`](./data.crontab) **is** the contract — schedule + endpoints, in
US Eastern (the market day, #26). [`cron-tick.sh`](./cron-tick.sh) is a thin,
fail-loud `curl` wrapper each line calls.

| Endpoint | Cadence (ET) | Why |
|---|---|---|
| `POST /news/pull` | hourly 09–17, Mon–Fri | stage market-wide FMP news (sole entry trigger) |
| `POST /news/triage` | hourly 09:10–17:10, Mon–Fri | screen + enrich freshly-staged news per symbol |
| `POST /scan/earnings` | 22:00, Mon–Fri | discovery scanner → candidates |
| `POST /internal/expire-watchlist` | 06:00 daily | TTL sweep of discovery entries |
| `POST /internal/redeliver` | every 5 min | outbox retry of pending notifications |

`/news/pull` takes `{"days":N}` (default 7); `/news/triage` takes an empty body
(triages all untriaged staged rows). `/scan/earnings` and `/internal/*` POST an
empty body `{}`.

`flock` per job makes a slow tick skip rather than stack the next one. Cadence
is a starting point — tune the crontab to taste.

## Wiring it up

### docker-compose / VM (persistent)

The cron environment needs `DATA_BASE_URL` and `cron-tick.sh` on `PATH`.
Inside the compose network data listens on `8080` as host `data`, so
`DATA_BASE_URL=http://data:8080`; from the host it's `http://localhost:8081`.

A minimal cron sidecar (not added to `docker-compose.yml` — drop in if wanted):

```yaml
  cron:
    image: alpine:3
    environment:
      - DATA_BASE_URL=http://data:8080
    volumes:
      - ./deploy/cron:/etc/cron-contract:ro
    command: >
      sh -c "apk add --no-cache curl tini flock &&
             cp /etc/cron-contract/cron-tick.sh /usr/local/bin/ &&
             chmod +x /usr/local/bin/cron-tick.sh &&
             crontab /etc/cron-contract/data.crontab &&
             crond -f -l 8"
    depends_on:
      - data
```

Or on a VM: `sudo cp cron-tick.sh /usr/local/bin/ && crontab data.crontab`
(set `DATA_BASE_URL` in the crontab env or the user's environment).

### Cloud Run (scale-to-zero) → Cloud Scheduler

One Cloud Scheduler job per endpoint, hitting the deployed data URL. Cloud
Scheduler honors a timezone directly, so the same ET cadence applies. Example:

```bash
DATA_URL="https://data-XXXX.run.app"   # deployed data service
TZ="America/New_York"

gcloud scheduler jobs create http data-news-pull \
  --schedule="0 9-17 * * 1-5" --time-zone="$TZ" \
  --uri="$DATA_URL/news/pull" --http-method=POST \
  --headers="Content-Type=application/json" --message-body='{"days":1}' \
  --oidc-service-account-email="$CRON_SA"   # see #24 (service-to-service auth)

gcloud scheduler jobs create http data-redeliver \
  --schedule="*/5 * * * *" --time-zone="$TZ" \
  --uri="$DATA_URL/internal/redeliver" --http-method=POST \
  --headers="Content-Type=application/json" --message-body='{}' \
  --oidc-service-account-email="$CRON_SA"
# …one per row in data.crontab.
```

When the endpoints get service-to-service auth (#24), the in-network sidecar and
the Cloud Scheduler OIDC token both attach the same credential; the contract
(endpoints + cadence) is unchanged.

## All three services

Each backend service has its own crontab contract, driven the same way (sidecar
crontab for VMs, Cloud Scheduler for Cloud Run — set `BASE_URL` per service):

| Contract | Endpoints | Why |
|---|---|---|
| [`data.crontab`](./data.crontab) | `/news/pull`, `/news/triage`, `/scan/earnings`, `/internal/expire-watchlist`, `/internal/redeliver` | ingest + triage + discovery + outbox retry |
| [`alpha.crontab`](./alpha.crontab) | `/internal/reprocess`, `/internal/redeliver` | recover stuck notifications + signal-outbox retry (background work is at-least-once) |
| [`portfolio.crontab`](./portfolio.crontab) | `/jobs/track` | **close open positions** on stop/target/expiry — without it positions never settle |

On Cloud Run, see [`DEPLOY.md`](../../DEPLOY.md) for the `gcloud scheduler jobs
create http` commands that wire each line to the deployed service URL.
