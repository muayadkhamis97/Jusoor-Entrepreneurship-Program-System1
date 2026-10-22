---
name: Drizzle correlated projections
description: Avoid outer-column shadowing in correlated SQL projection subqueries.
---

Explicitly qualify correlated outer-table references in SQL projections rather than relying on interpolated Drizzle Column qualification.

**Why:** Drizzle's single-table projection rewriting stripped qualification from an outer `id` inside a message subquery. PostgreSQL bound it to the inner message ID, producing incorrect previews and unread counts without a query error.

**How to apply:** Keep static qualified outer identifiers or explicit SQL aliases in correlated projections, with all user values bound. Test against PostgreSQL with parent and child IDs that deliberately differ; mocked query tests will miss this.
