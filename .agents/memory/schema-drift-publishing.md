---
name: Schema drift and publishing
description: Detect application/schema drift and dependency-order failures in managed Publish schema diffs.
---

An empty development-to-production Publish diff does not prove that either database matches the application schema source.

**Why:** A post-login access-check failure occurred while both database environments lacked staff columns expected by the application. Publish initially reported no differences because the two actual database schemas matched each other.

**How to apply:** For missing-column access failures, inspect the actual development schema and compare it to the failing application projection. Apply only approved development-side migrations, then review the resulting Publish diff. Keep authorization checks intact and use Publish, not workspace production DDL, for managed production schema updates.

Inspect the ordering of prerequisite parent keys and dependent composite foreign keys in a generated Publish diff, not only whether all statements are present.

**Why:** Publish omitted standalone composite unique indexes in one observed diff. Modeling them as explicit unique constraints made them appear, but the generated order still added dependent foreign keys first. PostgreSQL rejects that order even though the final desired schema is valid.

**How to apply:** Compare development and read-only production catalogs, inspect the generated SQL, and verify it on disposable synthetic fixtures. If prerequisite keys are ordered after their dependent FKs, stage the parent keys through Publish first and add the dependent FKs in a second Publish. Get approval before temporarily removing development integrity constraints, retain application validation, and never bypass Publish with production DDL or truncate parent records merely to add redundant composite uniqueness.

Verify changed CHECK constraint definitions in the actual development catalog after a schema push; a successful push can leave an existing CHECK unchanged.

**Why:** widening an allowed-values CHECK in schema source was reported as applied, but the database still contained its old definition.

**How to apply:** compare `pg_get_constraintdef` with source. If necessary, replace the constraint atomically in development using the authorized database flow, then verify it again. Managed production changes still go through Publish.

A widened CHECK can differ between development and production while Publish reports no diff if its name stays unchanged. A distinct constraint name can make the replacement visible.

**Why:** Direct catalog comparisons showed different allowed values, but the publish diff omitted the same-name change. Renaming the development constraint surfaced an explicit drop-old/add-new pair without removing data-bearing objects.

**How to apply:** Verify both catalogs first. When a same-name CHECK update is omitted, give the corrected constraint a distinct name in schema source, apply it only to development, and inspect the resulting Publish SQL. Test valid and invalid values, explain any rollout warning, and leave production application to Publish.
