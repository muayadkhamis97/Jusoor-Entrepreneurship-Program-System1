---
name: Clerk guard testing
description: How to test Express authorization guards without Clerk session tokens or external auth calls.
---

In isolated app-composition tests, inject both the user-ID resolver and a synthetic verified-primary-email resolver into the production participant authorization middleware. This keeps email-to-application linking, accepted-enrollment checks, program matching, and actual route mounting under test without Clerk session-token setup or a live Clerk user lookup.

**Why:** Clerk's `getAuth()` checks that its own middleware initialized request context; attaching a hand-built `req.auth` object does not satisfy that runtime check. Injecting only the user ID still leaves the middleware's Clerk `getUser` call active, which can require a real key or external request.

**How to apply:** For isolated tests, inject the user ID and verified email resolvers plus a no-op upstream auth middleware into the app factory. Keep production defaults bound to Clerk and keep the real authorization guard mounted.
