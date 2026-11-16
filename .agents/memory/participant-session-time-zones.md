---
name: Participant session time zones
description: The current program-wide time zone assumption for sessions returned to participants.
---

Treat session `scheduledDate` and `startTime` values as wall-clock time in the program's saved IANA time zone. Programs default to `Asia/Amman` for existing and newly created records unless a coordinator chooses another zone. Include the zone explicitly in participant session API responses and convert wall-clock values to instants with zone-aware logic; do not interpret them in the participant's browser zone.

**Why:** Session records store a calendar date and clock time without an offset, so their program's zone is needed to identify the correct instant.

**How to apply:** Use the program's configured zone for participant session API responses and timing checks. Validate user-supplied values as real IANA zones, and keep `Asia/Amman` as the backward-compatible default.
