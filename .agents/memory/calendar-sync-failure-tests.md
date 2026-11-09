---
name: Calendar sync failure tests
description: Test sync-level database outages without altering node-postgres pool behavior.
---

Pass a checked-out PostgreSQL client through the sync's connection factory when injecting advisory-lock acquisition failures. Do not monkeypatch `Pool.connect` globally: `Pool.query` uses the callback overload of that method internally, and a promise-only replacement can leave database status writes waiting forever.

**Why:** A previous integration-test attempt stalled during failure-status persistence because the mock intercepted `Pool.query`'s internal callback-based checkout.

**How to apply:** For sync-level PostgreSQL integration tests, inject only the lock-owning client; leave the shared pool untouched so Drizzle updates and verification queries continue to work.
