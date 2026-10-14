---
name: Generated API type freshness
description: Refreshing workspace API declarations after merged OpenAPI changes.
---

When a frontend typecheck reports missing fields or hooks but the OpenAPI schema already contains those contract changes, regenerate the API clients before changing consumer code. Recent task merges updated generated source while the workspace consumer still resolved old declarations; running codegen refreshed the API libraries and restored correct types.

**Why:** Editing the frontend to satisfy stale declarations could undo a valid merged contract change or hide a real type mismatch.

**How to apply:** After a merge that changes API contracts, run API codegen and library typechecking before debugging downstream type errors.
