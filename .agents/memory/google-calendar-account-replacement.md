---
name: Google Calendar account replacement
description: Mentor account changes must not keep a public schedule link from the prior Google account.
---

When a mentor reconnects the same Google account, keep the public appointment-schedule link. When the account changes, clear that link so bookings do not continue to route through the previous account. Disconnecting clears the Google identity, tokens, sync state, and public schedule link; coordinators should continue to receive only provider and connection status, not the linked Google email.

**Why:** A public appointment schedule belongs to the account that created it; carrying it across an account change can misroute founder bookings.

**How to apply:** Preserve these behaviors in future Google Calendar OAuth, booking-provider, and coordinator-status changes.
