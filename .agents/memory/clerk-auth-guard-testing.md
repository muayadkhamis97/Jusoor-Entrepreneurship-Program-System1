---
name: Clerk guard testing
description: How to test Express authorization guards without Clerk session tokens or external auth calls.
---

Use an injectable user-ID resolver with the production participant authorization middleware in isolated app-composition tests. This keeps email verification, accepted-enrollment checks, program matching, and actual route mounting under test while avoiding Clerk session-token setup.

**Why:** Clerk's `getAuth()` checks that its own middleware initialized request context; attaching a hand-built `req.auth` object does not satisfy that runtime check.

**How to apply:** For isolated tests, inject the resolver and a no-op upstream auth middleware into the app factory. Keep production defaults bound to Clerk and keep the real authorization guard mounted.
