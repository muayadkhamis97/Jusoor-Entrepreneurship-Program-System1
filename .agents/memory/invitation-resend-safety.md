---
name: Invitation resend safety
description: Stable email delivery identity for explicit staff and participant invitation resends.
---

An Admin-initiated resend is a new delivery intent, separate from the original invitation. Give each explicit resend a fresh request ID and use it in the email idempotency key. Keep that ID when retrying the same request; if Gmail's outcome is uncertain, tell the Admin to check Sent before starting another resend.

**Why:** Reusing the original invitation key causes Gmail Sent lookup to suppress a deliberate resend. Generating a new key for every retry can send duplicates when a previous Gmail call was accepted but its response was lost.

**How to apply:** Preserve this distinction for both staff and participant invites. For durable protection across page reloads and concurrent Admin sessions, persist resend attempts server-side before calling Gmail and expose their state for reconciliation.
