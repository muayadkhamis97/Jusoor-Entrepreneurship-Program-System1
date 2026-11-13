---
name: Disposable PostgreSQL integration tests
description: Rules for running database-backed API tests against fresh local databases and keeping isolated test fixtures accurate.
---

Run default database integration coverage against a fresh disposable PostgreSQL cluster and apply the workspace Drizzle schema first. Tests that set their own `search_path` and create tables do not inherit that schema, so their fixtures must include every column used by real route code.

**Why:** A clean database exposed a hand-built route fixture that lagged behind newer staff columns, causing an unrelated database error before the intended rollback behavior could be checked.

**How to apply:** For PostgreSQL-backed API tests, use temporary local data, apply the Drizzle schema for shared tables, and compare manually created isolated tables with current schema definitions whenever request handlers write to them.

Keep every query builder and transaction bound to the same isolated test connection, not just the most commonly used database methods.

**Why:** Partial database-method replacement can let a new query builder escape to the public schema while other operations use temporary tables, producing misleading failures or touching unintended data.

**How to apply:** Prefer injecting one complete database executor. When maintaining older tests that replace methods, audit every database entry point used by the exercised code.
