---
name: Zoom meeting creation recovery
description: Durable safety rule for Zoom meeting creation when provider success and local persistence can be separated by a server failure.
---

Persist a per-session creation claim before sending Zoom's non-idempotent meeting-create request. Clear it after the meeting ID and join URL are saved, or after a definite authorization rejection. If the outcome is ambiguous or the process disappears, do not issue another create request; tell staff to verify Zoom and reconcile the existing meeting first.

**Why:** a server can fail after Zoom creates a meeting but before Jusoor saves its ID, and Zoom may create a duplicate if a retry blindly repeats the request.

**How to apply:** any code path that retries Zoom meeting creation must consult the durable session state. Keep known meeting IDs in the existing same-process recovery path, but treat a pending database claim without a known ID as requiring safe staff reconciliation.
