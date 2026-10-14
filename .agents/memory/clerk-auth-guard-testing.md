---
name: Clerk guard testing
description: How to test Express authorization guards without Clerk session tokens or external auth calls.
---

For participant app-composition tests, inject both the user-ID resolver and a synthetic verified-primary-email resolver into the production participant authorization middleware. For full staff-auth tests, a synthetic `req.auth` handler can exercise the production staff guard when it carries Clerk's global auth brand and a session-token auth object (`tokenType`, `userId`, `sessionStatus`, and `sessionClaims`).

**Why:** Clerk's `getAuth()` rejects an unbranded `req.auth` value and treats a session-token object without its required auth fields as signed out. Participant linking also performs a Clerk user lookup unless the resolver is injected.

**How to apply:** Keep production defaults bound to Clerk and keep the real authorization guard mounted. Use participant resolvers when testing participant email linking; use the branded synthetic request handler when the staff middleware's database-backed role resolution is part of the test.
