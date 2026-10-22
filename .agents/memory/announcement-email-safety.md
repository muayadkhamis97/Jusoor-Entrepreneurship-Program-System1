---
name: Announcement email safety
description: Opt-in announcements, accepted-audience snapshots, and conservative retry rules for Gmail.
---

Announcement emails must remain opt-in; never infer consent to send from an existing portal announcement. Snapshot accepted recipients at publication, and recheck their eligibility before delivery rather than expanding the audience during retries.

**Why:** Portal announcements predate email notification support. Backfilling sends or adding newly enrolled recipients during retries would notify people staff did not select at publication.

**How to apply:** Keep portal publishing independent of Gmail. Persist a delivery claim before sending and never automatically replay a stale claim or ambiguous Gmail outcome. Gmail Sent search with a stable Message-ID is an extra check, not a guarantee that a recent send is already searchable. Only definite failures before acceptance are safe to retry; report acceptance separately from inbox delivery.
