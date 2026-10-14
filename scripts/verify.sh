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
run_check "API package tests (isolated synthetic environment)" pnpm run test:api
run_check "Jusoor web unit tests" pnpm run test:web
run_check "API production build" pnpm --filter @workspace/api-server run build
run_check "Jusoor web production build" env PORT=19333 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/jusoor-program run build

printf '\nSKIPPED: browser-only certificate tests. Run pnpm --filter @workspace/jusoor-program run test:browser in a runner with compatible Chromium, Firefox, and WebKit executables.\n'

if ((${#failed_checks[@]} > 0)); then
  printf '\nValidation failed in: %s\n' "${failed_checks[*]}"
  exit 1
fi

printf '\nAll included validation checks passed. Browser-only certificate tests were skipped.\n'
