---
name: Zoom attendance matching
description: How attendance imports should identify businesses from Zoom participants.
---

Only auto-match a Zoom attendance row to a business when a normalized participant email maps to exactly one business. Missing or ambiguous emails remain unresolved for staff review. Do not guess a business from a display name, and do not automatically mark businesses absent while unresolved Zoom attendees could match them.

**Why:** Zoom may omit attendee email addresses, and inaccurate attendance can corrupt program reporting. The user chose email matching with staff review for unmatched attendees.

**How to apply:** Keep unresolved attendees visible to coordinators and the assigned trainer, preserve manual coordinator overrides during later syncs, and avoid silently converting uncertain participants into absences.
