---
name: Jusoor role boundaries
description: Durable access boundaries for coordinator, trainer, mentor, judge, and participant experiences.
---

- The Admin role is the platform administrator and manages team roles and program-wide configuration. Use “Admin” in visible copy while retaining `coordinator` as the internal role key.
- Program Staff may set or reschedule a module's release date/time, but cannot create modules, edit their content, publish them, or manage course materials.
- Participants should access only their own application, progress, learning activity, and feedback.
- Trainers work with assigned cohorts: they can review participant assignments and answers and reply to participant questions. They do not get course-authoring rights by default.
- Mentors work only within assigned support engagements; judges work only with assigned pitch scorecards.
- Course materials are audience-restricted. Trainers see only published, released material whose role allowlist includes trainers; participants see material allowed for participants.
- Course discussions are module-scoped: participants can post in released modules for their accepted cohort, trainers in released modules for assigned cohorts, and coordinators have program-wide access. Program Staff remain schedule-only.
- Quizzes follow the same cohort boundaries: coordinators author and publish; participants take published quizzes in released modules for accepted cohorts; trainers review attempts only for assigned, released cohorts.
- Session polls and surveys are coordinator-authored; assigned trainers can open/close activities and review their session responses. Participants respond once per business, and session Q&A is cohort-visible with trainer replies limited to assigned sessions.
- Profile editing is app-level: users can edit display name, phone, bio, organization, and profile photo. Admin may edit these details for both staff and participants; keep sign-in email, roles, and program assignments separate.

**Why:** The program uses distinct role workspaces; the user confirmed that project staff assign module dates while coordinators retain content control, requested Admin for all visible wording without changing the internal permission key, and specified profile fields and Admin editing scope.

**How to apply:** Enforce ownership and assignment checks in API routes, not just navigation. Use Admin in user-facing labels and messages, but keep the `coordinator` role value and authorization checks unchanged. Keep schedule-only staff responses free of course material details, require coordinator authorization for course and activity authoring, and keep each material's allowlist and release state effective on both listing and file-download requests. Apply accepted-cohort and assigned-trainer boundaries to discussions, quizzes, session activities, and live Q&A; do not expose quiz answer keys or private survey responses to participants. Apply profile edits only to the shared profile record, not to submitted applications or authorization assignments.
