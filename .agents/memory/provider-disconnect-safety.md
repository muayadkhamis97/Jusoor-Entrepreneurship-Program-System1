---
name: Provider disconnect safety
description: Safety rule for disconnecting OAuth-backed integrations.
---

For OAuth-backed integrations, attempt to revoke the provider grant before clearing local credentials. If the provider cannot confirm revocation, keep the local connection intact and return a safe error so an Admin can retry; never report a successful disconnect while provider access may remain active.

When an audit needs to identify the affected provider account, fetch only the required identity field before revocation, validate it, and store that projection alone. Identity lookup failure must not block revocation.

**Why:** keeping credentials allows a retry after a temporary provider outage, and prevents the UI from implying that outside access was revoked when it was not.

**How to apply:** use this sequence for provider disconnect routes, sanitize provider/network errors, and do not log tokens or provider response bodies. Treat an optional account-identity lookup as best-effort and never retain the full provider response.
