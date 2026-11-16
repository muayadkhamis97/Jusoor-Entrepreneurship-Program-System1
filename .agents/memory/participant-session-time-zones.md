---
name: Participant session time zones
description: The current program-wide time zone assumption for sessions returned to participants.
---

Until time zones are configurable per program, treat session `scheduledDate` and `startTime` values as Asia/Amman wall-clock time and include that IANA zone explicitly in participant session API responses. Convert those values to instants with zone-aware logic; do not interpret them in the participant's browser zone.

**Why:** Session records store a calendar date and clock time without an offset, while the program already uses Asia/Amman for program-wide calendar operations.

**How to apply:** If per-program time-zone settings are introduced, use the selected program's IANA zone for session API responses and participant timing checks rather than retaining this fixed default.
