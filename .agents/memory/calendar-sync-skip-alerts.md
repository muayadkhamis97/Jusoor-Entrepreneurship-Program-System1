---
name: Calendar sync skip alerts
description: Current aggregation boundary for repeated Google Calendar lock-contention alerts.
---

Repeated Calendar lock-contention skips currently aggregate inside each API process and emit an error-level structured alert after the per-mentor threshold. A rolling window in one process does not combine events from separate autoscale replicas.

**Why:** The advisory lock is shared across replicas, but adding durable cross-process aggregation would require shared state beyond the logger. Keep this boundary explicit when interpreting alert coverage.

**How to apply:** If operators need guaranteed fleet-wide detection, move skip aggregation to shared storage or the centralized logging/alerting pipeline rather than adding more process-local state.
