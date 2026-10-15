# Jusoor platform-wide UX/UI audit

**Audit date:** 2026-10-15, Asia/Amman  
**Project:** Current Jusoor Entrepreneurship Program System workspace only  
**Scope:** Read-only source and existing-evidence review, with a guarded development-browser attempt. This report is the only task-authored workspace change. No fixes were implemented.

## A. Executive summary

### Overall assessment

The platform has a recognizable, coherent visual foundation and substantial role-specific functionality. Its warm neutral surfaces, green primary actions, dark operations sidebar, restrained cards, Lucide icons, and consistent page headings are worth preserving. A complete redesign is not justified by this audit.

However, source inspection identifies important accessibility, localization, account-management, and workflow-consistency gaps. The platform should not yet be described as comprehensively verified for production-quality UX. In particular, the shared accessible dialog implementation has not reached several consequential workflows; Arabic support is incomplete even where translations already exist; default secondary text colors fall below normal-text contrast requirements; and the participant sign-out/account-switch action added after this audit still needs an authenticated Clerk check.

This is **not a visual certification of the entire application**. Signed-in pages were not rendered. The only current browser view inspected was the guarded English loading state at `/`, Chromium 390×844. Blocking database-backed API requests and identity initialization prevented the public landing content from rendering; this is an audit-induced limitation, not a demonstrated application defect.

### Strongest areas

- Existing `AccessibleDialogSurface` uses Radix modal infrastructure, accessible names, configurable dismissal, initial focus, and opener restoration. Reuse it rather than introducing another library.
- Applicant forms use React Hook Form/Zod and shared `FormLabel`/`FormControl` infrastructure that supplies field IDs and error associations. A simple search for missing IDs would incorrectly classify these controls as unlabelled.
- Main operations pages generally distinguish loading, request failure, and empty data, and expose retry actions. This is stronger than uniformly treating failed queries as empty lists.
- Mobile staff navigation has labels and active-page semantics; historical fixture evidence includes keyboard reachability and horizontal-scroll checks.
- Program archiving/restoration, grant corrections, API-secret handling, and deletion confirmations communicate consequential actions rather than relying entirely on unexplained icons.
- Learning supports release dates, material audiences, downloadable uploaded files, quizzes, discussions, recordings, completion reporting, and certificate workflows.
- Quiz ordering has explicit move-up/move-down controls in addition to drag interaction. Retain this non-drag alternative.
- Locale-aware dates/currency and document `lang`/`dir` updates already exist. Dynamic/user-authored content retains its original text rather than being forcibly translated.
- Profiles, invitation forms, peer-directory consent, and business-team privacy explanations have useful boundaries and feedback.

### Most important improvements

1. Extend existing accessible modal infrastructure to remaining custom dialogs.
2. Verify the participant sign-out/account-switch flow against Clerk with an authorized account.
3. Correct default secondary-text contrast and review functional text sizes.
4. Complete Arabic coverage for real interface text, not just existing `t()` calls.
5. Improve account/application error recovery and program-context clarity.

**Severity interpretation:** High = likely to substantially impede a core task, accessibility, or trustworthy account use. Medium = material usability or consistency problem. Low = polish or lower-risk refinement. No Critical UX finding was established.

## B. Method, architecture map, and coverage matrix

### Evidence status definitions

- **Confirmed — source:** Direct implementation evidence; does not imply browser reproduction.
- **Confirmed — calculation:** Reproducible calculation from inspected default CSS values; not an exhaustive rendered contrast scan.
- **Recorded historical evidence:** Existing documentation or supplied screenshots, not rerun by this audit.
- **Inferred risk:** Structure suggests a problem whose frequency/impact requires real-user or rendered verification.
- **Not verified / blocked:** No safe observation sufficient to make a claim.

The inspection mapped **30 named route surfaces/patterns**, counting `/` once although it changes with authentication, plus fallback states. Courses, quizzes, discussions, recordings, workbooks, and certificates also appear as embedded workflows rather than separate routes.

### Layout, component, and styling map

| Layer | Current implementation | Audit observations |
| --- | --- | --- |
| App/router/auth gate | `src/App.tsx`, Wouter, Clerk, React Query, language provider, error boundary | Public/authenticated routing and multi-role workspace selection are centralized. Source reviewed; no permissions altered. |
| Admin/project staff | `Shell`, `PageHeading`, `FormDialog`, `ConfirmDialog`, loading/error/empty components in `App.tsx` | Shared fixed desktop sidebar, mobile navigation, operations content region. |
| Specialists | `RoleFrame`, role headings, trainer/mentor/judge dashboards in `role-surfaces.tsx` | Independent top-bar layout with workspace-switch links and sign-out. |
| Applicant/participant | `IntakeFrame`, `ApplyPage`, `ParticipantDashboardPage`, enrollment cards in `intake-surfaces.tsx` | Separate public/founder layout; many participant tasks are stacked on one dashboard. |
| Dialog infrastructure | `accessible-dialog.tsx`; existing `components/ui/dialog.tsx` and `alert-dialog.tsx` | Good reusable infrastructure, but several pages still implement their own overlays. |
| Form infrastructure | `components/ui/form.tsx`, shared labels/controls, React Hook Form/Zod, operation `FieldControl` | Labels and validation are stronger where shared forms are used; not uniform across session interactions. |
| Tokens | `index.css` HSL semantic colors, font variables, radius/shadow values | Useful foundation; default muted text contrast and very small typography require attention. |
| Styling | `workspace.css`, `role-workspace.css`, `language.css`, feature-specific CSS files | Repeated component families and physical-direction rules produce consistency/RTL risks. |
| Other shared workflow components | Calendar, recording player, quiz editor/player, discussions, learning progress, assessment comparison, profile editor, business-team and peer components | Reviewed by targeted source inspection; no data-backed flow executed. |

### Route/page coverage

All source references below are under `artifacts/jusoor-program/src/` unless another path is stated.

| Route or page group | Roles / relevant task | Source inspected | Current viewport/browser coverage | Status and notable observations |
| --- | --- | --- | --- | --- |
| `/` public landing | Visitor; apply or sign in | `App.tsx:1003–1018`, landing CSS | Chromium 390×844, English **loading state only** | Guarded render blocked before landing. Branding/CTA structure source-reviewed; landing composition not visually verified. |
| `/sign-in/*`, `/sign-up/*` | All account types | `AuthPage`, Clerk appearance/localization and router in `App.tsx` | None | Source-reviewed; actual Clerk widget, account recovery, Arabic widget layout not verified. |
| `/apply` | Applicant registration | `intake-surfaces.tsx:95–171`, shared form infrastructure, intake CSS | None | Label/validation/retry/success structure reviewed. No application submitted; all populated form rendering unverified. |
| `/verify-certificate` | Public certificate checking | `CertificateVerificationPage` in `learning-progress.tsx` | None | Verification states reviewed in source; no certificate/API request made. |
| `/participant` | Founder application/enrollment status and learning | Participant dashboard/enrollment cards in `intake-surfaces.tsx` | None | Source-reviewed: enrollment status, sessions/support, assignments/questions, updates, teams, peer directory, workbooks, progress and learning. Long-page/account-navigation risks. Participant account actions are covered separately below. |
| `/participant/profile` | Participant profile editing | `ParticipantProfilePage`, shared profile editor in `profile-surfaces.tsx` | None | Source-reviewed; uploads/saves not executed. Participant account actions are covered separately below. |
| `/` operations overview | Admin/project staff | `Overview`, `Shell`, navigation, `workspace.css` | None | Metrics, stage pipeline, upcoming sessions, empty/error states reviewed. |
| `/businesses` | Admin/project staff; startup records | `BusinessesPage`, business edit form, table/filter CSS | None | Search/stage/industry/program filters, edit/delete confirmation reviewed. No current sidebar-scroll reproduction. |
| `/programs` | Admin/project staff; cohort management | `ProgramsPage`, archive/restore and lifecycle-history dialogs | None | Source-reviewed: program states, archive/restoration controls and history. No archive/restore action performed. |
| `/sessions` | Admin/project staff; schedule/recording/attendance | `SessionsPage`, `SessionCalendar`, interactions/player components | None | Source-reviewed: schedule, assigned trainer, meeting status, recording notices and Drive player. No provider connection or attendance sync triggered. |
| `/communications` | Admin; announcements/reminders | `communications-surfaces.tsx` | None | Compose/schedule/read-status/error states reviewed. Recent-message panel retains raw English. No message created/read status changed. |
| `/support` | Admin/project staff; mentoring/agency links | `SupportPage` and related form/card styles | None | Matching/engagement controls reviewed; no booking/provider action performed. |
| `/mentor-booking` | Admin; mentor setup/follow-up visibility | `MentorBookingStatusPage`, follow-up editor | None | Setup/status UX reviewed only. Calendly OAuth itself excluded from this audit. |
| `/pitches` | Admin/project staff; pitch/evaluation assignment | `PitchesPage`, judge-assignment row | None | Source-reviewed; evaluation/assignment actions not executed. |
| `/grants` | Admin; awards, installments/corrections | `grant-surfaces.tsx` and CSS | None | Receipt/correction form and ledger presentation reviewed; custom modal focus gap. No financial record created. |
| `/courses` | Admin; course management. Project staff; release scheduling | `course-surfaces.tsx` and course CSS | None | Module/material audiences, release dates, uploads/package launch, edit/delete forms reviewed. Shared content dialog is a positive pattern. |
| Embedded quizzes/assessments | Admin/trainer/participant as permitted | `course-quizzes.tsx`, draft helpers, assessment comparison/history | None | Question types, ordered answers, grade/attempt/review controls source-reviewed. Keyboard reorder alternative present; actual attempts not verified. |
| Embedded discussions/live activities | Trainer/participant/admin as permitted | `course-discussion.tsx`, `session-interactions.tsx` | None | Thread/reply/poll/survey/Q&A error and submission states reviewed. Session activity editor remains custom; text-response labelling gaps. |
| Embedded packages/recordings/offline materials | Authorized learners/staff | `course-package-player.tsx`, `session-recording-player.tsx`, material links | None | Package modal has Escape handler but no shared focus containment. Drive iframe has title; uploaded-file download vs internet-required resources differentiated. Actual media/captions/package/offline behavior not verified. |
| Embedded learning progress/certificates | Participant/admin | `learning-progress.tsx`, `certificate-pdf.tsx`, comparison/history components | None | Progress, assessments, eligibility/approval/revocation/export structure reviewed. No certificate issued/revoked/downloaded. |
| `/analytics` | Admin; engagement/attendance/KPIs/reports | `analytics-surfaces.tsx`, `learning-progress.tsx`, analytics CSS/export helpers | None | Filters, missing-data distinctions, charts/tables, CSV/print report controls reviewed. Custom modal and translation gaps. No export executed. |
| Embedded idea validation/business plan | Accepted participant | `idea-validation.tsx`, `founder-business-plan.tsx` | None | Guided prompts, form feedback and progress structure reviewed. No workbook saved. |
| Embedded peer directory/business teams | Accepted participant | `peer-directory.tsx`, participant team component | None | Opt-in privacy messaging and business-only sharing reviewed. Team-load failures are misdescribed as setup. No directory preferences changed. |
| `/team` | Admin; access/invitations | `TeamPage` | None | Staff and program/business participant invitation forms, pending/joined states reviewed. UI explicitly says it does not send email. No invitation issued. |
| `/team-assignments` | Admin/project staff; program roles/business membership | `team-assignments.tsx` and CSS | None | Program selection, multiple specialist roles and business-team editing reviewed. No role/team change made. |
| `/access` | Admin; permissions explanation/illustrative role preview | `role-access.tsx` and CSS | None | Matrix/preview distinctions are explicit; tab keyboard semantics incomplete; substantial untranslated static copy. Preview is not a real role session. |
| `/profile`, `/profiles` | Staff self-edit/admin edit other profiles | `profile-surfaces.tsx` and CSS | None | Registered profile search, identity/access boundaries, upload/save/error notices reviewed. No actual profile changed. |
| `/branding` | Admin; visual identity | `branding-surfaces.tsx`, branding CSS, applied app tokens | None | Preview/default restore/save structure reviewed. Custom-brand contrast not measured. No identity changed. |
| `/api-integrations` | Admin; program-scoped developer keys | `api-integrations.tsx` and CSS | None | Scope/read-write controls, one-time secret and revoke acknowledgement reviewed. No key created/copied/revoked; custom modal focus gaps. |
| `/trainer`, `/trainer/courses`, `/trainer/sessions` | Trainer; assignments/reviews/live learning | `TrainerDashboardPage`, `RoleFrame`, read-only course/session views | None | Assigned data/workspace switches reviewed. Cohort selector uses numeric identifiers and derives its choices from sessions. |
| `/mentor` | Mentor; assigned engagements/feedback/booking preferences | `MentorDashboardPage`, specialist styles | None | Source reviewed only; provider authorization not inspected/exercised. |
| `/judge` | Judge; assigned pitches/scorecards | `JudgeDashboardPage`, scorecard component and CSS | None | Assignment/scoring form hierarchy reviewed; no score submitted. |
| Loading/denied/failure/not-found/fallback | All | Auth status components, `RoleNotFound`, `NotFoundPage`, error boundary | Guarded root loading only | Actual permissions failures, page-error recovery and navigation redirects not exercised. Several fallback strings remain raw English. |

**Viewport status across actual pages:** 390×844 loading state only. 375 px, 768×1024, 1440×900, 1920×1080 and populated/authenticated views are **not verified**. CSS breakpoint inspection is not equivalent to viewport testing.

## C. Prioritized findings register

### UX-01 — Remaining custom modals do not use shared focus management

- **Severity/category:** High / Accessibility
- **Affected:** Analytics attendance/KPI/value/delete/report dialogs; grant receipt/correction dialog; API secret/revocation dialogs; session activity editor; learning-package player.
- **Evidence:** Raw `role="dialog"`/`aria-modal` sections at `analytics-surfaces.tsx:517,550,562,574,576`, `grant-surfaces.tsx:91`, `api-integrations.tsx:212,219`, `session-interactions.tsx:63`, `course-package-player.tsx:123`. These do not use `AccessibleDialogSurface`. Grant amount `autoFocus` is not a focus trap. Package player has a window Escape handler at lines 114–119, but no opener restoration/containment implementation.
- **Impact:** Keyboard users can lack reliable entry/restoration or reach background controls while a modal is presented. Particularly consequential for grants, revocation and attendance.
- **Recommendation:** Migrate these surfaces to existing shared dialog infrastructure, retaining explicit pending/dismissal/secret-acknowledgement rules. Add one synthetic fixture pass covering focus entry, containment, restoration and Escape for these dialog families.
- **Status:** Confirmed — source gap. Live keyboard behavior not verified. Existing shared dialogs must not be described as broken; this finding is about unreused infrastructure.

### UX-02 — Arabic mode still leaves substantial functional interface text in English

- **Severity/category:** High / Localization
- **Affected:** Analytics, operations sessions/support/pitches, participant enrollment sections, communications list, access preview and fallback pages.
- **Evidence:** Raw JSX text at `analytics-surfaces.tsx:376–405` includes “Stage distribution”, “Participation over time”, table headings and “No recent activity”. `communications-surfaces.tsx:78–83` includes “Recent messages”, statuses and retry copy. `role-access.tsx:114–168` includes preview headings, role labels and explanations. `intake-surfaces.tsx:312` starts a raw “Sessions” section; `App.tsx:953,1036` contains raw fallback/privacy copy. `translate()` at `language.tsx:1486–1488` translates only supplied strings, not arbitrary DOM text.
- **Impact:** Arabic users encounter mixed-language instructions and operational terms, making task comprehension and the professional impression inconsistent.
- **Recommendation:** Wrap fixed interface strings in the existing helper, translate static status/count/templates deliberately, and expand coverage tests to raw UI text and additional page families. Preserve proper nouns, URLs and user-authored content.
- **Status:** Confirmed — source. Current Arabic pages not visually rendered. Static text-node counts were used as search candidates, not as a count of missing translations.

### UX-03 — Default secondary text colors fail normal-text contrast

- **Severity/category:** High / Accessibility
- **Affected:** Shared helper text, page descriptions, metadata and other uses of muted text.
- **Evidence:** `index.css:42,44,54` defines background `hsl(42 36% 96%)`, card `hsl(40 38% 99%)`, and muted foreground `hsl(202 11% 47%)`. WCAG sRGB luminance calculation gives **4.052:1** on background and **4.284:1** on card, below **4.5:1** for normal text. At .66 opacity the calculated values fall to **2.331:1** and **2.401:1**. `workspace.css` uses these values on small descriptions/form placeholders; `index.css:124,133,142` uses them on intake copy.
- **Impact:** Users with low vision or difficult viewing conditions may struggle with instructions and supporting information.
- **Recommendation:** Darken functional secondary text tokens, avoid low-opacity instructional text, and verify rendered combinations after changes. Check custom branding independently.
- **Status:** Confirmed — calculation from default CSS, not a rendered platform-wide contrast scan. Decorative/disabled exceptions are not the basis of this finding.

### UX-04 — Participant sign-out/account-switch flow needs an authenticated Clerk check

- **Severity/category:** High / UX
- **Affected:** `/participant`, `/participant/profile`.
- **Evidence:** `ParticipantAccountActions` is mounted in both `ParticipantDashboardPage` (`intake-surfaces.tsx`) and `ParticipantProfileLayout` (`profile-surfaces.tsx`), and delegates to Clerk’s existing `useClerk().signOut`. `App.tsx:1220` routes signed-out participant URLs through the existing Clerk sign-in flow; `App.tsx:1031` returns signed-in participants to `/participant`. A standalone Chromium fixture exercised the component with a synthetic sign-out callback; no Clerk session was used.
- **Impact (before implementation):** A founder on a shared device could not clearly end the session; users signed in with the wrong application email lacked an obvious account-switch path. A “Sign in again” link is not an explicit sign-out.
- **Recommendation:** Verify the real Clerk handoff with an authorized participant session. Consider showing the current verified account email near the controls so founders can confirm which identity they are leaving.
- **Status:** Implemented in source and synthetic browser-tested. “Sign out” returns to the app landing route; “Switch account” ends the session and returns to `/participant`, where the existing Clerk sign-in flow is shown. This is not a live in-session identity picker. Real Clerk session invalidation, redirect, and reauthentication remain **not verified**; the signed-in page was not rendered. Failure feedback and retry, keyboard activation, and 390px/1440px control bounds passed in the synthetic fixture.

### UX-05 — Functional typography is frequently too small

- **Severity/category:** Medium / Visual Design
- **Affected:** Forms, metadata, tables, specialist dashboards and mobile supporting copy.
- **Evidence:** `workspace.css:241,244` uses 10 px field/control text; `index.css:133,136–142` uses 10–12 px intake labels/help/controls; `role-workspace.css` includes 9–11 px feedback and assignment copy. At ≤460 px some overview metadata drops to 7–9 px (`workspace.css:374–385`). Mobile 16 px overrides target `.form-control`, search and filter selectors, not all intake/custom controls.
- **Impact:** Dense operational content becomes harder to scan; Arabic glyph detail and small-screen input readability are particularly sensitive.
- **Recommendation:** Define functional body/label/helper scales, reserve microtype for nonessential metadata, and extend input-size rules to all active field families. Start with participant/application forms and table controls.
- **Status:** Confirmed — source values; rendered readability and mobile input zoom not verified. A 16 px input target is a usability convention, not itself a WCAG requirement.

### UX-06 — Application submission errors hide actionable causes

- **Severity/category:** Medium / UX
- **Affected:** Public application submission.
- **Evidence:** `intake-surfaces.tsx:155` uses the same connection/retry message for every `submit.isError`. `artifacts/api-server/src/routes/publicApplications.ts:112–114` specifically returns 409 when the email already has an application for the program.
- **Impact:** An existing applicant may repeatedly retry an impossible submission rather than sign in to the existing application.
- **Recommendation:** Distinguish duplicate application, invalid/closed program, validation and temporary outage cases; retain form input and offer the relevant sign-in/status action.
- **Status:** Confirmed — source mapping. No duplicate or other application was submitted to reproduce it.

### UX-07 — Business-team request errors are described as ongoing setup

- **Severity/category:** Medium / UX
- **Affected:** Participant business-team panel.
- **Evidence:** `intake-surfaces.tsx:255` renders “Your business team is being set up. Check again later.” for **every** `query.isError`. Empty membership is separately handled at line 256.
- **Impact:** An outage, access failure or unavailable schema is presented as an intentional administrative process. Users cannot distinguish failure from pending setup and have no local retry.
- **Recommendation:** Keep pending/empty and request-failure states separate; add a retry action and a neutral failure explanation.
- **Status:** Confirmed — source. Actual failing response not triggered.

### UX-08 — Draft dialog content can be dismissed without warning

- **Severity/category:** Medium / UX
- **Affected:** Shared operation forms and custom analytics/activity/receipt editors.
- **Evidence:** `AccessibleDialogSurface` defaults outside dismissal/Escape to enabled (`accessible-dialog.tsx:26–27`). `FormDialog` stores values locally and calls `onClose` without a dirty-state decision (`App.tsx:125–139`). Activity editor backdrop calls `onClose` (`session-interactions.tsx:62`); analytics editors have similar outside-click dismissal. No shared unsaved-change guard was found in these flows.
- **Impact:** Accidental dismissal can discard entered drafts. Closing during a pending mutation can also obscure its eventual feedback, depending on the caller.
- **Recommendation:** Define one dirty/pending dismissal policy: safe cancellation before editing, explicit discard confirmation for dirty input, and clear pending behavior. Do not prevent Escape universally.
- **Status:** Confirmed — source disposal/dismissal paths; actual draft-loss/pending timing not browser-tested.

### UX-09 — Program context is local to individual operations pages

- **Severity/category:** Medium / UX
- **Affected:** Cross-page admin/project-staff workflows.
- **Evidence:** `BusinessesPage` initializes its program filter from `?programId=` (`App.tsx:419–425`); staff navigation destinations are plain paths in `mobile-staff-navigation.tsx:32–61`. Session/team/course pages keep their own selection state. There is no shared selected-program context in `Shell`.
- **Impact:** Moving from a filtered business view to scheduling or role assignment can lose cohort context and require reselection. With multiple programs, users may not notice a broadened scope.
- **Recommendation:** Make current scope explicit and carry it across related destinations using a deliberate URL/shared selector convention. Retain a clearly labelled “All programs” view where appropriate.
- **Status:** Confirmed — source structure; frequency of wrong-context actions is an inferred risk, not a reproduced mistake.

### UX-10 — Participant dashboard stacks many major tasks without section navigation

- **Severity/category:** Medium / UX
- **Affected:** Founder daily workflow.
- **Evidence:** `intake-surfaces.tsx:243` appends enrollment cards, business teams, announcements, idea validation, business plan, learning progress and program learning. Enrollment cards further include sessions, support, assignments, questions and peer access.
- **Impact:** With real coursework and multiple enrollments, finding the next task may require extensive scrolling, especially on phones.
- **Recommendation:** Retain the dashboard but add a compact section index/jump navigation and a focused “Next action” summary; progressively disclose completed/secondary sections.
- **Status:** Confirmed — source structure. Scroll length, time-on-task and real-data density are inferred/unverified.

### UX-11 — RTL handling is incomplete in feature-specific styles and icons

- **Severity/category:** Medium / Localization
- **Affected:** Analytics, role preview, directional links/package controls.
- **Evidence:** `analytics.css:45,49,53,96` uses physical `text-align:left`, right borders and left margins; `.ana-table` explicitly aligns left. `role-access.css:17` uses left alignment/padding. `language.css:115–118` rotates an up-right arrow 180°, giving a **down-left** arrow rather than a horizontal up-left mirror. `App.tsx:1034` uses a literal left back arrow; package close uses `ArrowLeft`.
- **Impact:** Mixed alignment and misleading icon direction can make Arabic interfaces inconsistent even when document direction is correct.
- **Recommendation:** Use logical spacing/alignment selectively; audit directional icons by meaning rather than rotating every icon. Keep email/URL/currency fragments appropriately isolated.
- **Status:** Confirmed — source rules; actual Arabic placement, wrapping and mixed-content behavior not visually verified.

### UX-12 — Session text-response controls lack persistent individual labels

- **Severity/category:** Medium / Accessibility
- **Affected:** Participant survey short answers and session Q&A.
- **Evidence:** `session-interactions.tsx:157` renders a short-answer textarea inside a question fieldset without an individual label/label association. Line 168 renders the ask-question textarea with placeholder only. A fieldset legend names its group, not necessarily the individual textarea.
- **Impact:** Users can lose prompt context while typing; screen-reader form navigation has weaker control naming, especially for several short-answer questions.
- **Recommendation:** Give each response control a unique ID and explicit label or `aria-labelledby` tied to its prompt; provide a persistent Q&A label. Keep fieldset/legend semantics for grouped choices.
- **Status:** Confirmed — source labelling gap. Actual accessibility-tree output not inspected. Placeholder fallback naming is not treated as a sufficient persistent visible label.

### UX-13 — Mobile staff navigation depends on discovering horizontal scrolling

- **Severity/category:** Medium / Responsive
- **Affected:** Mobile admin/project-staff navigation.
- **Evidence:** `mobile-staff-navigation.tsx:32–61` contains a long labelled destination list; `workspace.css:272–273,329–335` makes it a horizontal scrolling strip. Historical fixture checks confirm a scrollable range and keyboard access.
- **Impact:** Less visible destinations such as profiles/team access may be overlooked on touch devices; many icons/text chips compete in a small header.
- **Recommendation:** Preserve reachable labelled navigation, but add a clear overflow affordance or compact “All pages” menu with task grouping. Compare alternatives before replacing a working strip.
- **Status:** Inferred discoverability risk. Current touch interaction and viewport rendering not verified; keyboard reachability has historical fixture evidence.

### UX-14 — Dense tables need clearer large-cohort and mobile ergonomics

- **Severity/category:** Medium / Responsive
- **Affected:** Business lists, team assignments, analytics engagement tables.
- **Evidence:** Business rows are rendered from the full filtered array in `App.tsx:455–460`; no pagination/row window is provided there. Shared mobile table minimum width is 660 px (`workspace.css:347`). Analytics `.ana-table` has an 850 px minimum width (`analytics.css:96`); engagement has eight columns (`analytics-surfaces.tsx:401`).
- **Impact:** Phones require lateral scanning; large cohorts can produce lengthy tables and weaken row/action context.
- **Recommendation:** Use clear scroll affordances, preserve identity/action context, expose concise mobile summaries for common tasks, and add pagination/row-count controls when real cohort sizes justify them. Retain existing business filters.
- **Status:** Confirmed — source dimensions/row rendering; actual clipping, dataset size and performance not verified. Horizontal table scrolling is not automatically an accessibility failure.

### UX-15 — Reduced-motion support is limited to one loading family

- **Severity/category:** Medium / Accessibility
- **Affected:** Page entry, skeleton loaders, discussions, dashboard/analytics transitions.
- **Evidence:** Multiple CSS files define entry/shimmer/spinner animations. The source search found `prefers-reduced-motion` only in `course-package-player.css:12`, disabling that package skeleton.
- **Impact:** Users requesting less motion still receive avoidable movement elsewhere.
- **Recommendation:** Add shared reduced-motion rules for nonessential entry/hover/shimmer motion while retaining nonanimated progress/status meaning.
- **Status:** Confirmed — source coverage; preference emulation not executed. This is an accessibility recommendation, not a claim that every animation violates WCAG AA.

### UX-16 — Role-preview tabs have incomplete keyboard tab behavior

- **Severity/category:** Medium / Accessibility
- **Affected:** `/access` illustrative workspace selector.
- **Evidence:** `role-access.tsx:148–153` sets `role="tablist"`, `role="tab"`, `aria-selected` and controls, but has no arrow/Home/End handler or roving `tabIndex`. The tabpanel lacks a selected-tab `aria-labelledby` association.
- **Impact:** Users encounter tab semantics without expected tab keyboard behavior; all options remain ordinary tab stops.
- **Recommendation:** Reuse the installed Radix tabs infrastructure, or implement its complete keyboard pattern. If these are simply selection buttons, use appropriate simpler semantics instead.
- **Status:** Confirmed — source; manual keyboard behavior not tested.

### UX-17 — Parallel styling/component families increase inconsistent behavior

- **Severity/category:** Medium / Design System
- **Affected:** Analytics/API/learning-progress dialogs, buttons, forms and notices.
- **Evidence:** Shared `.button`/`.form-control` coexist with `.ana-button`, `.api-button`, `.lp-button` and independent modal backdrops. Tokens exist, but feature CSS repeats font sizes, padding, radii, shadows and physical positioning. API copy also uses a local English/Arabic helper alongside global `t()`.
- **Impact:** Accessibility fixes and responsive improvements do not propagate reliably; similar actions feel and behave differently.
- **Recommendation:** Standardize behavior first: dialog, field, status, destructive confirmation and button variants. Keep legitimate domain-specific page layouts and migrate incrementally.
- **Status:** Confirmed — source duplication; subjective visual mismatch across rendered pages not verified.

### UX-18 — Trainer assignment cohort choices are numeric and session-derived

- **Severity/category:** Medium / UX
- **Affected:** `/trainer`, create assignment.
- **Evidence:** `role-surfaces.tsx:72–73` derives program choices from `dashboard.sessions`; line 131 labels options “Cohort {id}”, not the program name.
- **Impact:** Trainers assigned to several programs must know internal numeric IDs. A program with no returned session cannot appear in this selector even if other program-role access exists.
- **Recommendation:** Obtain named permitted cohorts from the appropriate authorized program data, and show readable names; distinguish “no assigned cohort” from “no session scheduled”.
- **Status:** Confirmed — source option construction. Whether a no-session program should be eligible is a product/API-contract assumption to confirm, not an asserted authorization defect.

### UX-19 — Invitation workflow terminology can imply delivery that does not happen

- **Severity/category:** Low / UX
- **Affected:** `/team`, staff/participant invitations.
- **Evidence:** `TeamPage` explains that approving/inviting does **not** send email, but action wording still uses “Invite participant”; pending state is “Waiting for sign-in”.
- **Impact:** An admin may assume the recipient has been notified, despite helper text, leaving an approved account unused.
- **Recommendation:** Keep the no-email behavior, but reinforce it in success feedback and provide a safe copyable sign-in/instructions action. Do not add email delivery without a separate authorized scope.
- **Status:** Inferred expectation risk grounded in source wording; no recipient/admin usability test performed.

### UX-20 — Arabic typography does not consistently inherit the Arabic font choice

- **Severity/category:** Low / Localization
- **Affected:** Arabic headings, specialist/public typography and identity.
- **Evidence:** `language.css:49–51` sets Arabic body family to `"Noto Sans Arabic", Tahoma, Arial`; `index.css:1` imports Latin-oriented families but not Noto Sans Arabic. Many headings explicitly declare `Manrope` in `index.css`/`role-workspace.css`, overriding body inheritance; some keep English-tuned negative letter spacing.
- **Impact:** Font fallback and heading/body rhythm may vary across devices; Arabic titles can feel less cohesive than English.
- **Recommendation:** Choose a deliberately available Arabic heading/body stack and language-aware spacing tokens; render Arabic pages before deciding whether to add a bundled font.
- **Status:** Confirmed — source font declarations; actual glyph fallback/readability is unverified. Font installation/download is not part of this audit.

## D. Prioritized improvement roadmap

| Order / group | Recommended batch | Expected benefit | Scope and dependencies |
| --- | --- | --- | --- |
| 1 — Critical issues affecting safe/successful use | **No Critical issue established.** Do not manufacture one from unavailable browser coverage. | Honest prioritization. | Complete safe rendered verification when an authorized environment exists. |
| 2 — High-impact accessibility | Extend shared dialog infrastructure (UX-01). | Reliable keyboard operation for grants, analytics, keys and learning/activity editors. | Reuse existing Radix wrapper; preserve form state, pending mutations and one-time-secret acknowledgement. No backend changes needed. |
| 3 — High-impact account usability | Participant account/sign-out action (UX-04). | Clear session ending and wrong-email recovery, especially on shared devices. | Existing Clerk sign-out pattern; participant frame/header and profile layout. Requires authorized account testing later, not auth bypass. |
| 4 — High-impact legibility | Secondary-text contrast, then functional typography (UX-03, UX-05). | More readable instructions and data across all roles. | Token changes followed by representative contrast checks; avoid blindly changing decorative/disabled states. |
| 5 — High-impact bilingual use | Translate functional raw strings and improve coverage guard (UX-02). | Arabic users can complete the same tasks as English users. | Agree consistent role/stage terminology; preserve dynamic content. Arabic screenshots required for final visual acceptance. |
| 6 — Error recovery and draft safety | Duplicate-application feedback, true team-load errors, dismissal policy (UX-06–08). | Fewer futile retries and accidentally discarded drafts. | Existing response statuses and form state; no data/schema changes needed. Pending-action behavior needs targeted tests. |
| 7 — Context/navigation | Named trainer cohorts, explicit program context, participant section index (UX-09, UX-10, UX-18). | Easier multi-program work and faster daily founder tasks. | Trainer program contract may need an authorized named-cohort response. Program-selection conventions should be agreed before broad adoption. |
| 8 — Responsive consistency | Mobile navigation affordance, table ergonomics (UX-13, UX-14). | Less hidden navigation and lateral scanning. | Safe populated synthetic fixtures, real cohort-size assumptions, phone/tablet checks. Do not impose a card conversion on every table. |
| 9 — Accessibility/RTL consistency | Labels, tabs, reduced motion, logical direction/icon handling (UX-11, UX-12, UX-15, UX-16). | More predictable keyboard, assistive-technology and Arabic behavior. | Existing shared controls; test EN/AR and reduced-motion fixtures. |
| 10 — Lower-priority polish | Consolidate recurring variants, clarify non-delivered invitations, deliberate Arabic typography (UX-17, UX-19, UX-20). | Lower maintenance burden and more coherent presentation. | Incremental adoption, not a platform rewrite. No new email provider/font/dependency without separate authorization. |

## E. Design system recommendations

1. **Preserve semantic tokens and the current brand direction.** Adjust failing text tokens instead of replacing the palette wholesale. Distinguish readable functional metadata from purely decorative microtype.
2. **Make one dialog behavior standard.** `AccessibleDialogSurface` is the preferred local foundation; existing UI dialog/alert-dialog primitives remain useful for compatible feature components.
3. **Standardize functional typography.** Define body, table, label, helper, heading and metadata scales, including an Arabic-aware family/line-height policy.
4. **Reuse field infrastructure.** Keep `FormLabel`/`FormControl` associations and inline validation. Connect help/errors to the control and use consistent pending/success/failure feedback.
5. **Standardize status states.** Loading is not empty, error is not setup, pending invitation is not delivery, and missing analytics data is not zero. Include relevant retry/next actions.
6. **Use a small action vocabulary.** Primary save/publish, secondary cancel/back, quiet row action and explicit destructive confirmation should share sizes, naming and behavior.
7. **Add a consistent account/context pattern.** Show current role/program scope and give every authenticated role a reachable account action. Do not confuse an illustrative role preview with an actual permission switch.
8. **Prefer logical layout properties.** Use inline/block spacing and intentional icon mirroring; do not blanket-flip media, numerals, charts or branding.
9. **Keep useful accessible alternatives.** Preserve quiz move controls, visible text labels, table headers and non-color status descriptions.
10. **Treat print/export as a separate presentation surface.** Analytics has CSV and branded print-report code; PDF pagination, Arabic layout and large exports still require a later authorized render/export check.

## F. Verification, existing evidence, and limitations

### Checks actually performed in this audit

- Read attached brief and mapped router, role navigation, page exports, shared controls, dialogs, language handling and feature CSS.
- Targeted source/AST inspection of top-level page/workflow components, raw JSX candidates, native field labelling candidates and modal semantics. Candidates were checked against shared wrappers before becoming findings.
- Inspected application error response source for the public duplicate-application case; no endpoint called.
- Calculated default CSS text contrast with the WCAG sRGB relative-luminance formula: results recorded in UX-03.
- Read existing QA/build documentation and current package scripts. Did **not** run builds, typechecks, test commands, servers or workflows.
- One guarded Chromium attempt at development `/`, 390×844, English/default state. Screenshot evidence `6d0tso` was visually inspected; `26697g` records the same loading state.
- Before navigation the browser installed network guards blocking all application `/api` requests and all non-GET requests, allowing static GET assets only. Requests to `/api/branding` and Clerk initialization POST were blocked. An initially overbroad static-resource guard was corrected without allowing data/provider requests.
- Browser outcome: centered J mark, language button and “Checking your staff access…” remained. Initialization logged a failed fetch under the intentional guard. No attempt was made to bypass it.
- Initial repository status was clean apart from the attached brief. The audit adds this report only.

### Existing evidence read, not rerun

`docs/BUILD_VALIDATION.md:40–68` records earlier successful web typecheck, unit tests, Vite build, and a Chromium synthetic fixture checking shared application-review/form dialogs, focus containment/restoration/Escape, language changes and mobile navigation. The documented 22-test run and one fixture-browser test apply to that historical checkpoint, not an audit-time rerun or certification of every current page.

The current `dialog-accessibility.browser.test.tsx` includes mobile English/Arabic navigation checks and shared-fixture interactions. Test code existence is not proof that the latest version passed. The fixture does not authenticate/render all production page compositions.

Existing build documentation records non-blocking Vite chunk-size warnings; later lazy-loading work and current output are not established by those older sizes. No new build/performance result is claimed here.

### Admin sidebar follow-up (2026-10-15)

- **Status:** The reported washed-out/blank sidebar state on `/support` was not reproduced in the available safe browser setup. No production CSS was changed because the current evidence does not establish a root cause.
- **Source inspection:** Admin routes remain inside one `Shell`; changing Wouter's location updates the active link without replacing the shell. The sidebar has an opaque theme background, fixed viewport positioning, its own vertical scroll area, and z-index 30. The workspace texture is z-index 20; the route-entry transform is confined to main content. `/support` does not render a modal/overlay by default. No route-specific opacity, background, or stacking rule affecting the sidebar was found.
- **User image:** The later screenshot attachment is a tight crop of the bottom profile/sign-out row. It shows the panel still dark, but does not include the route, viewport boundary, or washed-out region, so it does not establish the cause.
- **Isolated browser evidence:** `src/admin-sidebar-layout.browser.test.tsx` uses the production `workspace.css` and Admin navigation-item helper in a synthetic shell, without Clerk, backend requests, or external services. Chromium passed navigation through every Admin destination, active-state changes, page and sidebar scrolling, viewport-height coverage, sidebar/background stacking, and the main-content offset. A screenshot of this fixture showed the dark panel covering the viewport. This does **not** reproduce the authenticated application shell or prove the reported state cannot occur there.
- **Build/typecheck:** The focused browser test passed. The app typecheck did not pass: it reports an unavailable generated API export `useGetStaffAssignmentHistory` and an implicit-`any` callback in `src/team-assignments.tsx`; neither file was changed for this sidebar investigation.
- **Not verified:** The current authenticated `/support` page and the reported browser/scroll state. The managed web workflow is now running, but the available browser has no authenticated Admin session; no identity-provider request or bypass was used. No production site, database, or external provider was accessed.
- **Conclusion:** The current source and isolated test show the intended sidebar geometry is stable, but cannot identify the cause of the screenshot symptom. A current full-viewport screenshot or an authenticated local browser reproduction is needed before making a CSS/stacking change.

### Not verified

- Populated public landing/application pages; application submission/success/error behavior.
- Any authenticated Admin, project staff, participant, trainer, mentor or judge page.
- Current Arabic visual rendering, RTL wrapping, text clipping, mixed-direction fragments or custom Clerk-widget layout.
- Tablet, desktop, wide desktop, 375 px, landscape, touch/virtual keyboard, 200% zoom/text resizing.
- Actual keyboard/focus behavior outside historical synthetic fixture evidence; current screen-reader trees, live announcements and contrast scan.
- Real large-cohort performance, pagination needs, chart accessibility, sorting expectations and bulk-task usability.
- Recording playback/captions, third-party booking, Zoom actions, package focus inside iframe, offline downloads and exported PDF/CSV output.
- Profile uploads/saves, invitation acceptance, permissions, enrollment, archival, financial mutations, certificate issuance/revocation.
- Production/runtime health, current build/test pass status, database/schema state or migration readiness.

### Safety accounting

No dependencies installed, application files edited, workflows started/restarted, migrations/schema pushes run, database connection/query/seed performed, credentials accessed, authentication bypassed, existing data changed, email sent, provider action completed, or publishing/deployment attempted. Browser language/account actions were not performed. The report does not authorize later production work.

## G. Recommended next implementation task

**Unify keyboard accessibility for the remaining custom dialogs.**

This is the highest-value manageable first batch because a proven local implementation already exists, the changes can stay frontend-only, and the affected interactions include important operational decisions.

**Scope:** Analytics attendance/KPI/value/delete/report dialogs; grant receipt/correction dialog; API secret/revoke dialogs; live activity editor; learning-package modal.

**Preserve:** Existing validation and field values, pending-state controls, outside/Escape rules where meaningful, explicit destructive confirmation, one-time-secret acknowledgement, package lifecycle/iframe behavior, and existing Arabic strings.

**Acceptance:** Accessible name/description; predictable initial focus; Tab/Shift+Tab containment; safe Escape behavior; focus restoration after unmount; no unintended discard or background action; no new dependency. Verify in an isolated synthetic UI fixture at mobile/desktop sizes in English/Arabic, then separately authorize signed-in verification when a safe environment is available.

**Excluded:** Provider connections, production/database changes, schema work, email, deployment, full visual redesign and unrelated refactoring.

No implementation was begun by this audit.

## H. Dialog accessibility remediation follow-up (2026-10-15)

**Root cause:** Shared dialog cleanup skipped focus restoration when the invoking element had been removed. Closing a dirty form and its nested discard confirmation at the same time also allowed focus restoration to race Radix’s portal/background cleanup, leaving focus on the body or causing a nested fallback to compete with the original page opener.

**Changes:** The shared Radix surface captures the opener once at dialog entry. On close it restores focus to the opener when usable; otherwise it targets the topmost remaining modal, then a main landmark. Restoration waits briefly for portal cleanup and does not override focus already restored by a concurrently closing parent. Course module and material editors now ask before discarding changed fields. Pending destructive mutations cannot be dismissed with Escape, and their cancel controls remain disabled until completion; quiz-editor close/discard controls also stay disabled while saving.

**Dialog inventory:** Application and record forms/confirmations, program archive/history, application review, analytics attendance/KPI/value/delete/report, grant receipt/correction, API one-time secret/revocation, interactive-session activity, course module/material/delete, quiz editor and learning-package player use the shared accessible surface. The certificate preview uses the Radix `DialogContent` primitive with an accessible title and description, and its open state is retained while issuance is pending. The generic command-dialog wrapper exists but has no application call site in the inspected source; no raw application modal overlay bypass was found in the inspected feature files.

**Evidence:** `pnpm --filter @workspace/jusoor-program run test:ui-browser` passed 2 tests (source contracts plus Chromium fixture). The fixture tests desktop bounds at 1280×800, mobile behavior at 390×844 and 320×800, focus entry/Tab/Shift+Tab/Escape/restoration, removed and missing openers, nested dirty-form keep/discard, error-state input retention, a destructive confirmation, pending revocation, a synthetic one-time-secret acknowledgement, and Arabic RTL discard text. `pnpm --filter @workspace/jusoor-program run test:unit` passed 40 tests. The production build completed; typecheck still reports only the two existing assignment-history errors in `src/team-assignments.tsx` (missing generated `useGetStaffAssignmentHistory` export and implicit callback `any`). Full details are in `docs/BUILD_VALIDATION.md`.

**Not verified:** Authenticated Admin or participant routes, route-specific browser rendering, assistive-technology behavior, and other browser engines. The browser fixture is synthetic and does not call the API. No authentication bypass, database, production data, external provider, email, publish, or deployment action was used.
