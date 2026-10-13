---
name: Jusoor role boundaries
description: Durable access boundaries for coordinator, trainer, mentor, judge, and participant experiences.
---

- The coordinator is the platform administrator and manages team roles and program-wide configuration.
- Program Staff may set or reschedule a module's release date/time, but cannot create modules, edit their content, publish them, or manage course materials.
- Participants should access only their own application, progress, learning activity, and feedback.
- Trainers work with assigned cohorts: they can review participant assignments and answers and reply to participant questions. They do not get course-authoring rights by default.
- Mentors work only within assigned support engagements; judges work only with assigned pitch scorecards.
- Course materials are audience-restricted. Trainers see only published, released material whose role allowlist includes trainers; participants see material allowed for participants.
- Course discussions are module-scoped: participants can post in released modules for their accepted cohort, trainers in released modules for assigned cohorts, and coordinators have program-wide access. Program Staff remain schedule-only.
- Quizzes follow the same cohort boundaries: coordinators author and publish; participants take published quizzes in released modules for accepted cohorts; trainers review attempts only for assigned, released cohorts.

**Why:** The program uses distinct role workspaces; the user confirmed that project staff assign module dates while coordinators retain course-content control, and selected discussions and quizzes for interactive learning.

**How to apply:** Enforce ownership and assignment checks in API routes, not just navigation. Keep schedule-only staff responses free of course material details, require coordinator authorization for course authoring, and keep each material's allowlist and release state effective on both listing and file-download requests. Apply accepted-cohort, assigned-trainer, release, and coordinator boundaries to discussions and quiz attempts; do not expose quiz answer keys to participants before submission.
