#!/bin/bash
set -euo pipefail

# Post-merge setup may install dependencies, but must never apply database
# schema changes. Apply reviewed SQL migrations only through the approved,
# explicitly authorized database change process.
pnpm install --frozen-lockfile
