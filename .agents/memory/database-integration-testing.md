---
name: Disposable PostgreSQL integration tests
description: Rules for running database-backed API tests against fresh local databases and keeping isolated test fixtures accurate.
---

Run default database integration coverage against a fresh disposable PostgreSQL cluster and apply the workspace Drizzle schema first. Tests that set their own `search_path` and create tables do not inherit that schema, so their fixtures must include every column used by real route code.

**Why:** A clean database exposed a hand-built route fixture that lagged behind newer staff columns, causing an unrelated database error before the intended rollback behavior could be checked.

**How to apply:** For PostgreSQL-backed API tests, use temporary local data, apply the Drizzle schema for shared tables, and compare manually created isolated tables with current schema definitions whenever request handlers write to them.
