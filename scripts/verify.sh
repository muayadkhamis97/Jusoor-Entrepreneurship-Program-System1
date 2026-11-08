#!/usr/bin/env bash
set -uo pipefail

failed_checks=()

run_check() {
  local label="$1"
  shift

  printf '\n=== %s ===\n' "$label"
  if "$@"; then
    printf 'PASS: %s\n' "$label"
  else
    local status=$?
    printf 'FAIL: %s (exit %s)\n' "$label" "$status"
    failed_checks+=("$label (exit $status)")
  fi
}

run_check "Workspace typechecks" pnpm run typecheck
if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  run_check "API package tests (with dedicated PostgreSQL integration database)" pnpm run test:api:integration
else
  printf '\nNOTE: PostgreSQL integration tests are skipped. Set TEST_DATABASE_URL to a dedicated disposable PostgreSQL database with the application schema and run pnpm run test:api:integration to include them.\n'
  run_check "API package tests (database integration suites skipped)" pnpm run test:api
fi
run_check "Mentor request review-versus-withdrawal race test" pnpm run test:api:mentor-race
run_check "Jusoor web unit tests" pnpm run test:web
run_check "Team directory bilingual responsive browser regression" pnpm run test:web:team-directory
run_check "API production build" pnpm --filter @workspace/api-server run build
run_check "Jusoor web production build" env PORT=19333 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/jusoor-program run build

printf '\nSKIPPED: other browser suites (including certificates). The Team directory Chromium regression above is included. Run pnpm --filter @workspace/jusoor-program run test:browser in a runner with compatible Chromium, Firefox, and WebKit executables for all browser suites.\n'

if ((${#failed_checks[@]} > 0)); then
  printf '\nValidation failed in: %s\n' "${failed_checks[*]}"
  exit 1
fi

printf '\nAll included validation checks passed, including the Team directory browser regression. Other browser suites were skipped.\n'
