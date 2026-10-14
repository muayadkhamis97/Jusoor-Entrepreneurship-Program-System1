---
name: Certificate revocation privacy
description: Privacy boundaries for coordinator certificate revocation audit details.
---

Participants and public verification may see that a certificate was revoked and when, but revocation reasons and coordinator identities are staff-only.

**Why:** Coordinator-entered reasons may contain internal notes or sensitive context; the public needs a clear validity result without access to that audit detail.

**How to apply:** Include the revoker and reason in coordinator-only responses and views. Keep them null or absent in participant and public responses while preserving the revoked status and timestamp.
