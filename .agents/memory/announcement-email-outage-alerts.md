---
name: Announcement email outage alerts
description: Keep announcement-delivery outage notices independent of Gmail.
---

Announcement email quota or reconnect incidents must be surfaced in the Admin workspace from persisted request pause state. Do not send an outage alert through Gmail, the provider whose failure triggered the alert. Keep the alert free of participant addresses, announcement content, and provider credentials.

**Why:** A provider outage can prevent the notification from being delivered and can expose sensitive data unnecessarily.

**How to apply:** Build Admin alerts from aggregated pause state, deduplicate them while the pause remains active, and clear them when the persisted state recovers.
