# data — external cron contract (#23)

The data service has no in-process scheduler. Its `/pull/*`, `/scan/*` and
`/internal/*` endpoints are the canonical job definitions; an **external cron**
drives them on a schedule. This was a deliberate choice:

- The HTTP endpoints are already the single source of truth for "what a job
  does" — an in-process timer would just call the same code behind an env flag.
- Cloud Run scales to zero, where in-process timers are unreliable; an external
  scheduler hitting HTTP works for both persistent (docker-compose/VM) and
  scale-to-zero deploys.
- Since #4, every pull dedups on `(source, external_id)` and resumes from a
  per-source **watermark**, so ticks are idempotent and resilient to gaps — a
  missed or double-fired tick neither loses nor duplicates events.

## The contract

[`data.crontab`](./data.crontab) **is** the contract — schedule + endpoints, in
US Eastern (the market day, #26). [`cron-tick.sh`](./cron-tick.sh) is a thin,
fail-loud `curl` wrapper each line calls.

| Endpoint | Cadence (ET) | Why |
|---|---|---|
| `POST /pull/earnings` | 17:30 & 21:30, Mon–Fri | after-close (amc) earnings land in the evening |
| `POST /pull/ratings` | 18:00, Mon–Fri | analyst grade changes |
| `POST /pull/price-targets` | 18:00, Mon–Fri | price-target changes |
| `POST /pull/insider` | 18:00, Mon–Fri | insider trades |
| `POST /pull/mna` | 18:15, Mon–Fri | M&A activity |
| `POST /pull/news` | hourly 09–17, Mon–Fri | per-symbol news (auto flow) |
| `POST /scan/earnings` | 22:00, Mon–Fri | discovery scanner → candidates |
| `POST /internal/expire-watchlist` | 06:00 daily | TTL sweep of discovery entries |
| `POST /internal/redeliver` | every 5 min | outbox retry of pending notifications |

All POST with an empty body `{}`: symbols default to the watchlist, the window
comes from the watermark. Override per tick if needed (e.g. a manual backfill
`cron-tick.sh /pull/earnings '{"from":"2026-01-01","to":"2026-03-01"}'` — an
explicit window does NOT move the steady-state cursor).

`flock` per job makes a slow pull skip rather than stack the next tick. Cadence
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

gcloud scheduler jobs create http data-pull-earnings \
  --schedule="30 17,21 * * 1-5" --time-zone="$TZ" \
  --uri="$DATA_URL/pull/earnings" --http-method=POST \
  --headers="Content-Type=application/json" --message-body='{}' \
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

## Not in this cut

Per-service cron for **alpha** (`/internal/reprocess`, `/internal/redeliver`)
and **portfolio** (`/jobs/track`) follows the same pattern and is a deliberate
follow-up — this first cut covers data only.
