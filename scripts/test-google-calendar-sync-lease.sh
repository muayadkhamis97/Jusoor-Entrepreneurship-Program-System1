#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" == "0" ]]; then
  echo "The Google Calendar lock check needs a non-root user to start disposable PostgreSQL." >&2
  exit 1
fi

postgres_bin_dir=""
if command -v initdb >/dev/null 2>&1; then
  postgres_bin_dir="$(dirname "$(command -v initdb)")"
else
  for candidate in /nix/store/*-postgresql-16*/bin; do
    if [[ -x "$candidate/initdb" && -x "$candidate/pg_ctl" && -x "$candidate/createdb" ]]; then
      postgres_bin_dir="$candidate"
      break
    fi
  done
fi

if [[ -z "$postgres_bin_dir" ]]; then
  echo "PostgreSQL initdb, pg_ctl, and createdb are required for the Google Calendar lock check." >&2
  exit 1
fi

temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/google-calendar-lock.XXXXXX")"
data_dir="$temporary_dir/data"
log_file="$temporary_dir/postgres.log"
port="$(node -e 'const net = require("node:net"); const server = net.createServer(); server.listen(0, "127.0.0.1", () => { console.log(server.address().port); server.close(); });')"
server_started=0

cleanup() {
  if [[ "$server_started" == "1" ]]; then
    "$postgres_bin_dir/pg_ctl" -D "$data_dir" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$temporary_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"$postgres_bin_dir/initdb" -D "$data_dir" -U validation --auth=trust --no-locale >/dev/null
server_started=1
"$postgres_bin_dir/pg_ctl" -D "$data_dir" \
  -l "$log_file" \
  -o "-h 127.0.0.1 -k $temporary_dir -p $port -F" \
  -w start >/dev/null || {
    cat "$log_file" >&2
    exit 1
  }
"$postgres_bin_dir/createdb" -h 127.0.0.1 -p "$port" -U validation google_calendar_lock_test

echo "Running Google Calendar per-mentor lock test against disposable local PostgreSQL."
env -i \
  PATH="$PATH" \
  HOME="$HOME" \
  CI=1 \
  NODE_ENV=test \
  DATABASE_URL="postgres://validation@127.0.0.1:$port/google_calendar_lock_test" \
  TEST_DATABASE_URL="postgres://validation@127.0.0.1:$port/google_calendar_lock_test" \
  SESSION_SECRET=validation-only-session-secret \
  pnpm --filter @workspace/api-server exec tsx --test \
    --test-name-pattern="PostgreSQL advisory sync locks coordinate sessions per mentor" \
    test/googleCalendarSyncLease.postgres.test.ts

echo "Running deployment-wide rate-limit test against the same disposable PostgreSQL."
env -i \
  PATH="$PATH" \
  HOME="$HOME" \
  CI=1 \
  NODE_ENV=test \
  DATABASE_URL="postgres://validation@127.0.0.1:$port/google_calendar_lock_test" \
  TEST_DATABASE_URL="postgres://validation@127.0.0.1:$port/google_calendar_lock_test" \
  SESSION_SECRET=validation-only-session-secret \
  pnpm --filter @workspace/api-server exec tsx --test \
    --test-name-pattern="database rate limits remain global under concurrent requests and reset after the window" \
    test/databaseRateLimit.postgres.test.ts

echo "Running public judging routes against isolated PostgreSQL rate-limit tables."
env -i \
  PATH="$PATH" \
  HOME="$HOME" \
  CI=1 \
  NODE_ENV=test \
  DATABASE_URL="postgres://validation@127.0.0.1:$port/google_calendar_lock_test" \
  TEST_DATABASE_URL="postgres://validation@127.0.0.1:$port/google_calendar_lock_test" \
  SESSION_SECRET=validation-only-session-secret \
  pnpm --filter @workspace/api-server exec tsx --test \
    test/judgingForms.test.ts \
    test/judgingForms.concurrency.test.ts
