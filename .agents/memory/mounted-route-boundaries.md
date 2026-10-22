---
name: Mounted route authorization boundaries
description: Why access regression checks must exercise the actual shared router mounting order.
---

Verify role-access regressions through the actual shared router, not only isolated route modules.

**Why:** Isolated role tests passed while live Program Staff requests were denied by Admin middleware in an earlier, unrelated router. Express router-level middleware also runs on unmatched paths unless scoped to that router's namespace.

**How to apply:** When adjusting authorization or router mounts, test both allowed downstream staff endpoints and protected Admin endpoints through the shared router in production order. Preserve program-level filters; do not fix navigation failures by removing role guards.
