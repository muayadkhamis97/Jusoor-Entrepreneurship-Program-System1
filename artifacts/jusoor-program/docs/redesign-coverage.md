# Program Hub redesign coverage

## Design and implementation

Program Editorial remains the shared source of colors, fonts, spacing and primitives. The requested background `#F8F7FA`, cards `#FFFFFF`, borders `#E8E2ED` and accent-colored primary actions remain in use; saved branding still overrides the appropriate brand roles.

- Shared Button children now participate in one flex row rather than an unstyled wrapper. Small/default sizing, secondary/destructive variants, semantic link composition and a shared class recipe are documented and demonstrated in the design system.
- The legacy button import is now a compatibility adapter to Program Editorial, not a second local visual implementation.
- Team access has a rebuilt directory grid and action composition, responding to the content width beside navigation. Existing permissions, invitation delivery safety, resend/retry, edit and revoke handlers are preserved.
- Existing information architecture and business logic on the other pages are retained. Their own stylesheets were updated in place for consistent headings, compact cards, readable metadata, standard radii, tables and controls. This is not a wholesale rewrite of those pages' JSX.
- Chat now has independently scrolling conversation/history areas and a width-aware one-pane layout. Communications has a content-width breakpoint, matched composer/history surfaces and keyboard-visible filters.
- Icon descriptions now appear on hover and keyboard focus, dismiss with Escape, stay within the viewport, update with their accessible labels and clean up on removal. Installation covers public and authenticated routes.
- Integration heading strings no longer expose literal HTML line breaks. The permissions matrix uses wrapping fixed-layout columns instead of intrinsic widths that clip at intermediate RTL desktop sizes. Overview metric notes wrap rather than disappearing at the card edge.
- Branding's unsaved indicator now appears only when the form differs from its loaded/saved values.

## Route and role checklist

“Source treatment” includes the shared foundation and each family's local stylesheet changes. Browser results below refer to the real development app, never an illustrative Role access preview or the published site.

| Routes / screens | Role | Source treatment | Browser coverage |
|---|---|---|---|
| `/team` — team directory, participant invitations, search, delivery states and row actions | Admin | Rebuilt markup + CSS and shared controls | 1024, 1280, 1440 desktop; 768 tablet; 390 phone; Arabic RTL at 1024. Populated directory and empty participant invitations |
| `/`, `/businesses`, `/programs`, `/sessions`, `/support`, `/pitches` | Admin / Program staff | Shared shell and local operational layouts, cards, tables and controls | All routes visited as Admin at 1280; populated lists and representative empty sections |
| `/analytics`, report builder, learning analytics and `/grants` | Admin / Program staff | Local analytics/grant layouts, metrics, titles, tables and controls | Main routes visited as Admin at 1280. Nested report-builder and certificate dialogs not opened |
| `/branding`, `/api-integrations`, `/google-sheets` | Admin | Compact settings layouts, cards and shared controls | All main routes visited as Admin at 1280; no settings saved |
| `/applications`, application review/detail, `/mentor-booking`, `/mentor-meeting-reports` | Admin / Program staff | Shared/local review and status layouts, controls and tables | Main routes visited as Admin at 1280; empty applications/reports/mentor states. Nested populated detail states not exercised |
| `/team-assignments`, `/access`, `/profile`, `/profiles` | Admin / Program staff | Assignment/matrix widths, headings, profile panels and forms | All visited as Admin at 1280; `/access` also Arabic at 1024 before its final wrapping fix |
| `/communications`, announcement composition, history, recipients, receipt details and replies | Admin / Program staff | Composer/history layout, controls, typography and surfaces | Main route at 1280 and Arabic RTL at 1024; empty history and untouched composer |
| `/chat`, conversation selection, new-chat targets, message history/composer | Admin / Program staff | Width-aware split pane, scrolling regions, controls and states | Empty workspace and New chat panel at 1280; no message sent |
| `/judging-forms`, rubric editor, publication/share controls and assessments | Admin / Program staff | Shared controls and local form/card treatment | Main empty route visited as Admin at 1280; no form published |
| `/courses`, module/material forms, package player, quizzes, discussion, attendance and session interactions | Admin / Trainer | Local learning/progress/module density, forms and shared controls | Admin course page at 1280 with empty modules/resources. Nested populated learning screens not browser-verified |
| `/trainer`, `/trainer/courses`, `/trainer/sessions` | Trainer | Role shell, headings, feature cards and learning styles | Source updated; no trainer session browser-verified |
| `/mentor`, `/mentor/settings` | Mentor | Role shell, headings, booking/settings and report controls | Source updated; no mentor session browser-verified |
| `/judge` | Judge | Role shell, assignment/scoring cards and controls | Source updated; no judge session browser-verified |
| `/participant`, applicant status, enrollment/program learning and certificates | Applicant / Participant | Participant shell, header, program cards and learning styles | Source updated; no accepted-participant journey browser-verified |
| Participant idea-validation workbooks, business plan, peer directory, business-team membership | Participant | Their local form/card/metadata styles and shared controls | Source updated; nested participant screens not browser-verified |
| `/participant/profile`, `/participant/chat` | Participant | Profile form and shared chat layout | Source updated; not browser-verified as a participant |
| `/` public landing | Public | Shared brand tokens and Button composition | Screenshot checked at 1280 |
| `/sign-in`, `/sign-up`, access/loading/error pages | Public | Auth/status typography and shared control treatment; Clerk configuration unchanged | No Clerk UI interaction or auth-configuration changes |
| `/apply`, application form and submission/duplicate/error states | Public | Intake header, hero, card/form and success-screen treatment | Source updated; not submitted in browser |
| `/judging`, guest identity/rubric form, submitted/unavailable states | Public | Shared Button and local judging/intake treatment | Source updated; not browser-verified |
| `/verify-certificate`, lookup and verification states | Public | Verification typography, surfaces and controls | Source updated; not browser-verified |
| Not-found, access denied, loading and recovery states | All relevant roles | Shared typography, controls and compact empty/error surfaces | Admin transient access/loading screens observed; no forced network outage |

## Important form and state coverage

| State family | Preserved implementation | Browser exercise |
|---|---|---|
| Staff invitations | Pending, delivered, failed/retry and uncertain-result feedback; existing resend idempotency and confirmation paths | Delivered/unlinked and active accounts inspected. Invitation dialog opened/canceled; no email triggered |
| Participant invitations | Loading, error/retry, empty, populated/search, resend and copy-instruction paths | Empty state and invitation dialog inspected; no invitation submitted |
| Access changes | Edit form, save state/errors, destructive confirmation and cancel | Synthetic account edit opened/canceled; revoke confirmation canceled with Keep record |
| Operational forms | Business/program/session/support/pitch forms; filters, populated/empty/error/retry states | Main list routes inspected; no data mutation submitted |
| Reporting/grants | Loading/missing-data/empty/populated reports, receipt ledger and confirmation forms | Existing aggregate and award/empty receipt displays inspected; no receipt or award changed |
| Settings/integrations | Loading/error/retry, credential dialogs, provider status, disconnect/revoke confirmation | Main forms and disconnected states inspected; no connection changed |
| Course/participant learning | Loading/error/empty/populated modules, resources, progress, quiz attempts, package player and certificate dialogs | Empty Admin learning plan inspected; nested learner states retained but not exercised |
| Chat/communications | Loading/error/empty/populated, unsent drafts, retry, recipient visibility and safe delete confirmation | Empty chat/history, untouched announcement composer and canceled new conversation inspected |
| Public intake/judging/verification | Form validation, loading, unavailable, duplicate, successful and error/retry paths | Source behavior retained; no real submission |
| Icon descriptions | Hover, focus, Escape, viewport clamp, label updates and cleanup | Hover/focus/Escape checked on signed-in Sign out without activating it |

## Verification and limits

- App and design-system typechecks pass.
- **153 unit tests pass**, including Button composition/link semantics, requested neutral colors, tooltip positioning, wrapping permission columns and integration heading regressions.
- Production Vite build passes. Existing upstream source-map/PURE-annotation warnings remain non-fatal.
- One coordinated authenticated Admin browser journey visited every Admin route above. No settled route errors or document-level horizontal overflow were found.
- Team dialogs were opened and canceled safely. No invitation/email, role edit, revoke, profile/branding save, conversation, receipt or provider mutation was submitted.
- The browser found the integration heading and RTL matrix issues above; final fixes were confirmed by source regression checks, typecheck and build, not another full browser pass.
- Specialist and accepted-participant sessions, populated nested learning forms, and most public forms are **not browser-verified**. Their styling is updated, but Admin screenshots do not establish their role-specific visual behavior.
- Attendance and mentor-report spreadsheets retain intentional, labeled internal horizontal scrolling rather than hiding data.
- Only synthetic test staff rows were provisioned for the review; both were removed afterward. Existing user data and production were untouched.
- Preview serves the changed source. The published site has not been updated by this task; publishing remains a user action.
