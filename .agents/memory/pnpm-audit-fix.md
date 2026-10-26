---
name: pnpm audit fixer behavior
description: Preserve workspace safeguards and constrain automatic advisory resolutions.
---

Review automatic audit fixes before installing them. The pnpm audit fixer can rewrite workspace YAML, remove explanatory comments, and add open-ended minimum-version overrides that resolve to a newer major.

**Why:** An automatic fast-uri override resolved to a different major even though a patched release existed on the original major.

**How to apply:** Preserve existing workspace settings/comments, use exact reviewed security targets where a parent cannot be updated safely, and inspect the resolved lockfile before verification.

When a shared schema-library major changes, update code generators to emit that same major's syntax and regenerate their checked-in outputs before typechecking consumers.

**Why:** The Zod v4 upgrade initially left Orval generating v3-only coercion chains, which prevented a clean library build.

**How to apply:** Keep the generator's explicit schema-version target aligned with the workspace catalog; regenerate schemas and force a project-reference rebuild after upgrading.
