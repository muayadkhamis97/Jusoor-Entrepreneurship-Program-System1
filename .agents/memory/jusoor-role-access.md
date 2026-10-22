---
name: Jusoor role boundaries
description: Durable access boundaries for coordinator, trainer, mentor, judge, and participant experiences.
---

- The Admin role is the platform administrator and manages team roles and program-wide configuration. Use “Admin” in visible copy while retaining `coordinator` as the internal role key.
- Program Staff may set or reschedule a module's release date/time, but cannot create modules, edit their content, publish them, or manage course materials.
- Participants should access only their own application, progress, learning activity, and feedback.
- Trainers work with assigned cohorts: they can review participant assignments and answers and reply to participant questions, but cannot create cohort assignments. Admins and Program Staff create cohort assignments; trainers do not get course-authoring rights by default.
- Mentors work only within assigned support engagements; judges work only with assigned pitch scorecards.
- Trainer and mentor roles are assigned separately per program; one person may hold several roles in the same program and different roles in another.
- Admin may invite any email as a participant by assigning an existing business within a program. Teammates share business records only; learning activity and personal feedback remain private.
- Course materials are audience-restricted. Trainers see only published, released material whose role allowlist includes trainers; participants see material allowed for participants.
- Course discussions are module-scoped: participants can post in released modules for their accepted cohort, trainers in released modules for assigned cohorts, and coordinators have program-wide access. Program Staff remain schedule-only.
- Quizzes follow the same cohort boundaries: coordinators author and publish; participants take published quizzes in released modules for accepted cohorts; trainers review attempts only for assigned, released cohorts.
- Session polls and surveys are coordinator-authored; assigned trainers can open/close activities and review their session responses. Participants respond once per business, and session Q&A is cohort-visible with trainer replies limited to assigned sessions.
- Profile editing is app-level: users can edit display name, phone, bio, organization, and profile photo. Admin may edit these details for both staff and participants; keep sign-in email, roles, and program assignments separate.
- Hide functions the current user cannot access from panels and navigation.
- Program staff can communicate with participants in their assigned active programs; all-program announcements remain Admin-only.
- Chat supports both private participant/program-team conversations and shared business-team conversations, with explicit visibility labels.

**Why:** The program uses distinct role workspaces; the user confirmed that project staff assign module dates while coordinators retain content control, requested cohort assignments be created by Admin and Program Staff rather than trainers, selected interactive-learning features, requested Admin for visible wording without changing the internal permission key, specified profile editing, per-program multi-role assignments, and business-only participant team sharing.

**How to apply:** Enforce ownership and assignment checks in API routes, not just navigation. Use Admin in user-facing labels and messages, but keep the `coordinator` role value and authorization checks unchanged. Store staff roles per program and allow multiple specialist roles within each program. Tie participant access to a selected program and business, while keeping each participant's learning activity and feedback private. Keep schedule-only staff responses free of course material details, require coordinator authorization for course and activity authoring, and keep each material's allowlist and release state effective on both listing and file-download requests. Apply accepted-cohort and assigned-trainer boundaries to discussions, quizzes, session activities, and live Q&A; do not expose quiz answer keys or private survey responses to participants. Apply profile edits only to the shared profile record, not to submitted applications or authorization assignments.

**Why hide unavailable functions:** The user asked to hide functions from panels when the user has no access. Keep the backend checks; hiding controls is not an authorization mechanism.

**Why staff communications:** The user explicitly requested Communications for staff as well as Admins. Apply the existing program-assignment boundaries to history, publishing, deletion, and recording read receipts.

**Why chat visibility:** The user chose both private participant/program-staff conversations and shared business-team chats. Membership in a business must never grant access to another participant's private conversation.

Private announcement conversations use a participant's accepted application as their program context, including replies to all-program announcements. Incoming participant replies are read by the program team collectively, rather than tracking a separate inbox for each staff member.

**Why:** A global announcement must not let a staff member assigned to one program read replies made under another program. Shared team read status supports the existing Communications workspace without implying that every assigned staff member has personally read a message.

**How to apply:** Keep private threads distinct from shared business messages. If individual staff read receipts are later requested, treat that as a deliberate change to the team-inbox behavior, not as an incidental schema change.
