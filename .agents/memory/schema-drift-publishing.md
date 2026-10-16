---
name: Schema drift and publishing
description: Distinguish matching database environments from matching application schema expectations during access failures.
---

An empty development-to-production Publish diff does not prove that either database matches the application schema source.

**Why:** A post-login access-check failure occurred while both database environments lacked staff columns expected by the application. Publish initially reported no differences because the two actual database schemas matched each other.

**How to apply:** For missing-column access failures, inspect the actual development schema and compare it to the failing application projection. Apply only approved development-side migrations, then review the resulting Publish diff. Keep authorization checks intact and use Publish, not workspace production DDL, for managed production schema updates.
