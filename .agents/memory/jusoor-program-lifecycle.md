---
name: Jusoor program lifecycle
description: The program's cohort stages and founder support model.
---

Jusoor cohorts begin with outreach and applications. The in-person bootcamp or hackathon selects businesses for the online incubator, which provides live Zoom training with recordings, one-to-one mentoring, subject-matter experts, and branding or technical agency connections. Pitch day qualifies businesses for demo day, where judges select grant recipients.

Role model: coordinator is the platform administrator; Program Staff, participant, trainer, mentor, and judge have distinct views. Trainers can see cohort assignments and participant answers and reply to participant questions; mentor and judge access is limited to assigned work.

Mentor booking: each mentor authorizes their own Calendly account. Keep Calendly access and refresh tokens ephemeral. Store only per-mentor webhook routing and signing material encrypted with `SESSION_SECRET`.

**Why:** The program coordinator described this as the operating model for the Jusoor Entrepreneurship program.

**How to apply:** Keep bootcamp or hackathon selection distinct from incubation, pitch-day qualification, and demo-day grant decisions. Preserve role-specific views and access when adding workflows.

Each program is one cohort. A startup is assigned to the program selected in its application, and coordinators can classify the cohort roster by the startup's industry.

**Why:** The coordinator chose one group per program and asked to classify participants based on their startup; the existing industry field is the platform's startup classification.

**How to apply:** Keep cohort membership program-scoped and industry as a classification filter. Accepted applications determine course access; do not add a parallel group-membership model unless requested.

**Why:** The coordinator chose per-mentor booking accounts and Calendly for direct founder scheduling. Event sync needs to verify asynchronous bookings without ongoing API access to the mentor's Calendly account.

**How to apply:** Preserve individual mentor ownership; do not use a shared account or persist Calendly OAuth tokens. Store only per-mentor webhook routing and signing material encrypted with `SESSION_SECRET`, and reconnect Calendly if that secret rotates.

Google Calendar booking: each mentor connects their own Google account and supplies a public appointment-schedule link. Read-only event sync is limited to calendars they own and only metadata needed to match assigned founder appointments is retained.

Mentors must submit a separate report after every meeting. Reports show the coach's name and email and assigned business, list team members who attended, capture session topics/highlights/connections/other notes, and record agreed SMART Grow actions.

**Why:** The coordinator explicitly required a per-meeting mentor report and specified these fields.

**How to apply:** Keep reports attached to the mentor's assigned business engagement; derive coach and business identity server-side; offer only that business's accepted team members as attendees; preserve a separate historical report for every meeting instead of overwriting engagement notes.

**Why:** The user explicitly requested founder appointment history from Google Calendar. Google does not expose appointment schedule bookings separately from ordinary events, so the integration needs a narrow event-read scope; event titles, descriptions, locations, meeting links, and guest names are not needed to match appointments.

**How to apply:** Request only `calendar.events.owned.readonly` in addition to identity scopes. Encrypt refresh and short-lived access tokens with a key derived from `SESSION_SECRET`; keep access-token expiry and the incremental-sync cursor. Request only organizer/guest email, event ID, status, start/end, timezone, and update time; never persist guest email or calendar text content. Match an event only when its organizer is the connected mentor and exactly one currently assigned business is represented by its guests. Show the data-use notice before OAuth.

Session recordings are uploaded by program staff to Google Drive. Staff then add the Drive share link to the session, and the platform notifies accepted participants in that session's cohort that the recording is available. Participants and trainers watch it in an embedded player. Drive permissions control playback access. Zoom recording sync is disabled; Zoom is for live meeting management.

**Why:** The coordinator chose Google Drive as the only session-recording source instead of relying on Zoom cloud recordings, and asked that participants be notified when a recording is available on the platform.

**How to apply:** Keep Zoom for live meeting creation and updates, but do not sync or expose Zoom recordings. Trigger cohort-scoped participant notices only when staff adds a Drive link; treat that link as the participant-facing recording and ensure the intended cohort and trainers can access it.

Mentoring feedback includes participant ratings and comments. The assigned mentor and coordinator can see named feedback.

**Why:** The coordinator selected this visibility model for post-session evaluation.

**How to apply:** Restrict each response to its assigned mentor and coordinators; never expose individual feedback to other mentors or participants.
