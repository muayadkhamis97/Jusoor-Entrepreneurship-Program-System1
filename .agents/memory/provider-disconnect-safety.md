---
name: Provider disconnect safety
description: Safety rule for disconnecting OAuth-backed integrations.
---

For OAuth-backed integrations, attempt to revoke the provider grant before clearing local credentials. If the provider returns a refusal or a token/configuration error, keep the local connection intact and return a safe error so an Admin can retry. If revocation times out or the provider is unreachable, complete the local disconnect and log that revocation was unconfirmed; the provider may still retain access.

When an audit needs to identify the affected provider account, fetch only the required identity field before revocation, validate it, and store that projection alone. Identity lookup failure must not block revocation.

**Why:** the product decision is to let users remove a locally unusable connection during a provider outage, while preserving credentials when the provider explicitly refuses revocation and a retry may help. A local disconnect during an outage does not prove the provider grant was revoked.

**How to apply:** revoke first; only transport failures/timeouts may proceed with local clearing and a warning that revocation was unconfirmed. Provider HTTP refusals and token/configuration failures must preserve local credentials. Sanitize errors and never log tokens or provider response bodies. Treat optional account identity lookup as best-effort and retain only the validated identity field.
