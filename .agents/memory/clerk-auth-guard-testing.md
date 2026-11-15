---
name: Clerk guard testing
description: Isolated guard tests and identity provisioning for programmatic Clerk browser fixtures.
---

For participant app-composition tests, inject both the user-ID resolver and a synthetic verified-primary-email resolver into the production participant authorization middleware. For full staff-auth tests, a synthetic `req.auth` handler can exercise the production staff guard when it carries Clerk's global auth brand and a session-token auth object (`tokenType`, `userId`, `sessionStatus`, and `sessionClaims`).

**Why:** Clerk's `getAuth()` rejects an unbranded `req.auth` value and treats a session-token object without its required auth fields as signed out. Participant linking also performs a Clerk user lookup unless the resolver is injected.

**How to apply:** Keep production defaults bound to Clerk and keep the real authorization guard mounted. Use participant resolvers when testing participant email linking; use the branded synthetic request handler when the staff middleware's database-backed role resolution is part of the test.

Frontend authentication doubles must enforce Clerk's single-provider invariant rather than treating every provider as a transparent wrapper.

**Why:** Lazy public-to-authenticated startup nested two providers and crashed after successful email verification, while the permissive mock let all signed-in routing tests pass.

**How to apply:** Mirror the SDK's provider-nesting rejection in browser fixtures and check that confirmed sessions reach the server-side access check, including both public-entry handoff and direct workspace links.

For programmatic browser checks, an invited synthetic staff row may need explicit linking to the test session's actual user ID rather than relying on email auto-linking.

**Why:** A programmatic session showed the synthetic verified email in the browser, but the server-side invitation binding still did not establish staff access. Binding only the newly created test row to that session's user ID allowed the real database-backed guard to authorize the intended role.

**How to apply:** Keep normal authentication and authorization unchanged. Provision a unique synthetic staff identity, obtain its signed-in user ID without logging tokens, and link only that fixture when automatic email binding is unavailable. Remove test fixtures afterward; never grant test access by changing real accounts or bypassing guards.

Authentication component mocks must enforce path-routing compatibility, not only expose the configured path as a data attribute.

**Why:** The real Clerk sign-in form rendered nothing when mounted at a participant URL while configured for the sign-in URL; the mocked component still rendered, so routing tests passed despite a blank real sign-in page.

**How to apply:** Check the final browser URL against the component's configured path and confirm real SDK rendering with a signed-out screenshot after changing auth entry routes.
