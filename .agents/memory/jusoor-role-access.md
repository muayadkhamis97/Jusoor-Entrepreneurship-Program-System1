---
name: Jusoor role boundaries
description: Durable access boundaries for coordinator, trainer, mentor, judge, and participant experiences.
---

- The coordinator is the platform administrator and manages team roles and program-wide configuration.
- Participants should access only their own application, progress, learning activity, and feedback.
- Trainers work with assigned cohorts: they can review participant assignments and answers and reply to participant questions. They do not get course-authoring rights by default.
- Mentors work only within assigned support engagements; judges work only with assigned pitch scorecards.
- Course materials are audience-restricted. Trainers see only published, released material whose role allowlist includes trainers; participants see material allowed for participants.

**Why:** The program uses distinct role workspaces, and the user specified limited trainer capabilities rather than general administration.

**How to apply:** Enforce ownership and assignment checks in API routes, not just navigation. Require coordinator authorization for course authoring and keep each material's allowlist and release state effective on both listing and file-download requests.
