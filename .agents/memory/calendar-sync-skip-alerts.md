---
name: Calendar sync skip alerts
description: How repeated Google Calendar lock-contention events are tracked for operators and coordinators.
---

Operational log alerts still aggregate inside each API process, so their rolling window does not combine events from separate autoscale replicas. Coordinator-facing repeated-skip status is persisted on the mentor record and is visible across replicas. It remains until a real sync succeeds or fails; a skip after a ten-minute idle period starts a new count series.

**Why:** The coordinator endpoint may be served by a different replica from the worker that encounters lock contention. Persisting the visible status avoids relying on process-local memory and keeps a stale-data warning visible until an actual sync outcome is recorded.

**How to apply:** Treat the staff-record status as user-facing guidance, not as a fleet-wide operational alert. If operators need guaranteed cross-replica detection, move log aggregation to shared storage or the centralized logging/alerting pipeline.
