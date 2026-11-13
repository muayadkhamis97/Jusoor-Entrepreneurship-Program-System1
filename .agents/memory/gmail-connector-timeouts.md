---
name: Gmail connector timeouts
description: Bound Gmail connector requests without risking duplicate sends after ambiguous timeouts.
---

Use Replit Connectors' `createProxyFetch()` path with a `RequestInit.signal` to enforce real network aborts; the `proxy()` helper's public options do not accept an abort signal. If using an injected/mock `proxy()` client, bound its promise as a fallback. A timed-out Gmail send is ambiguous: do not blindly resend; use the existing Sent lookup to determine whether Gmail accepted it.

**Why:** an unbounded connector call can hold a request open, while a timed-out send may already have been accepted by Gmail.

**How to apply:** keep profile, send, and Sent lookup timeouts explicit; preserve stable request identity and let Sent lookup gate retries.
