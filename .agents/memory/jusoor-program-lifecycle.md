---
name: Jusoor program lifecycle
description: The program's cohort stages and founder support model.
---

Jusoor cohorts begin with outreach and applications. The in-person bootcamp or hackathon selects businesses for the online incubator, which provides live Zoom training with recordings, one-to-one mentoring, subject-matter experts, and branding or technical agency connections. Pitch day qualifies businesses for demo day, where judges select grant recipients.

Role model: coordinator is the platform administrator; Program Staff, participant, trainer, mentor, and judge have distinct views. Trainers can see cohort assignments and participant answers and reply to participant questions; mentor and judge access is limited to assigned work.

Mentor booking: each mentor authorizes their own Calendly account. Keep Calendly access and refresh tokens ephemeral. Store only per-mentor webhook routing and signing material encrypted with `SESSION_SECRET`.

**Why:** The program coordinator described this as the operating model for the Jusoor Entrepreneurship program.

**How to apply:** Keep bootcamp or hackathon selection distinct from incubation, pitch-day qualification, and demo-day grant decisions. Preserve role-specific views and access when adding workflows.

**Why:** The coordinator chose per-mentor booking accounts and Calendly for direct founder scheduling. Event sync needs to verify asynchronous bookings without ongoing API access to the mentor's Calendly account.

**How to apply:** Preserve individual mentor ownership; do not use a shared account or persist Calendly OAuth tokens. Store only per-mentor webhook routing and signing material encrypted with `SESSION_SECRET`, and reconnect Calendly if that secret rotates.

Google Calendar booking: each mentor authorizes their own Google account with identity-only OAuth scopes, then supplies a public appointment-schedule link. Discard the OAuth token after verifying the account; coordinators see only provider and connection status.

**Why:** Founder booking needs a public schedule link, not access to private calendar events.

**How to apply:** Keep Google OAuth scopes limited to account verification and do not persist or expose Google access tokens or account email. Add event sync only with an explicit product requirement and a separate privacy review.

Mentoring feedback includes participant ratings and comments. The assigned mentor and coordinator can see named feedback.

**Why:** The coordinator selected this visibility model for post-session evaluation.

**How to apply:** Restrict each response to its assigned mentor and coordinators; never expose individual feedback to other mentors or participants.
