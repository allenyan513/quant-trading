#!/bin/sh
# Idempotent cron tick for the data service's external cron contract (#23).
#
# POSTs one data endpoint with an (optional) JSON body and surfaces ok/fail so
# the cron log and any monitoring see failures. Safe to fire repeatedly: the
# pulls dedup on (source, external_id) and resume from the per-source watermark
# (#4), so a double-fire or a retried tick never duplicates or loses events.
#
# Usage:   cron-tick.sh <endpoint-path> [json-body]
# Example: cron-tick.sh /pull/earnings
#          cron-tick.sh /pull/news '{"days":1}'
#
# Env:
#   DATA_BASE_URL   base URL of the data service (default http://localhost:8081)
#   CRON_TICK_TIMEOUT  per-request seconds (default 120) — bounds a hung pull so
#                      ticks don't pile up across the interval
set -eu

base="${DATA_BASE_URL:-http://localhost:8081}"
path="$1"
body="${2:-{}}"
timeout="${CRON_TICK_TIMEOUT:-120}"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# -f: non-zero exit on HTTP >= 400 so failures propagate to cron/monitoring.
if resp="$(curl -fsS --max-time "$timeout" -X POST \
  -H 'Content-Type: application/json' -d "$body" "$base$path" 2>&1)"; then
  echo "$ts cron.tick.ok $path $resp"
else
  code=$?
  echo "$ts cron.tick.fail $path exit=$code $resp" >&2
  exit "$code"
fi
