---
name: Clean pnpm dedupe checks
description: Verifying that pnpm dependency overrides removed duplicate package copies.
---

To verify dependency deduplication by inspecting `node_modules/.pnpm`, use a clean install from the frozen lockfile. A regular install can leave unused package directories from the prior virtual store even when the lockfile no longer resolves them.

**Why:** The workspace retained old React and `tsx` virtual-store directories after their lockfile entries were removed, which made a successful override look ineffective.

**How to apply:** Confirm the lockfile no longer contains the duplicate versions, then rebuild `node_modules` with `pnpm install --frozen-lockfile` before counting package directories.
