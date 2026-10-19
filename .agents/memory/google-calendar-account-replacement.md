---
name: Google Calendar booking rules
description: Account replacement must clear stale schedule links; either provider connection removes connection follow-up.
---

When a mentor reconnects the same Google account, keep the public appointment-schedule link. When the account changes, clear that link so bookings do not continue to route through the previous account. Disconnecting clears the Google identity, tokens, sync state, and public schedule link; coordinators should continue to receive only provider and connection status, not the linked Google email.

**Why:** A public appointment schedule belongs to the account that created it; carrying it across an account change can misroute founder bookings.

**How to apply:** Preserve these behaviors in future Google Calendar OAuth, booking-provider, and coordinator-status changes.

## Connection follow-up

A mentor connected to either Google Calendar or Calendly does not need connection follow-up. A missing schedule link is not, by itself, a reason to flag a connected mentor for this follow-up.

**Why:** The user explicitly said a mentor who connected Google Calendar does not need follow-up. Connection follow-up and complete booking readiness are different concerns.

**How to apply:** Keep staff-page counts, filters, follow-up controls, API checks, and reminder selection consistent with this provider-neutral rule.
