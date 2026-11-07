# First-run onboarding plan

## Phase 1 audit

### Existing screens and reusable surfaces

- `src/pages/DashboardPage.tsx` — CGPA, target, credits, semester trend, empty state, and dashboard actions.
- `src/pages/SemestersPage.tsx` — semester and course-unit creation, editing, topic management, and course list.
- `src/pages/CourseDetailPage.tsx` — course assessments and score entry.
- `src/pages/SimulatorPage.tsx` and `src/lib/forecast.ts` — existing what-if projection functions.
- `src/pages/ImportSetupPage.tsx` — paste-link/token handling, Supabase preview, conflict selection, and idempotent import. Onboarding should embed this page rather than create a second importer.
- `src/components/Sidebar.tsx` — profile editor and the location for a Settings entry point.
- `src/lib/useAppData.ts` — existing `addSemester`, `addCourse`, assessment mutations, settings, and cloud record persistence.
- `src/lib/localSync.ts` — IndexedDB database `cgpa-tracker-local`, account-scoped `account_records`, `sync_outbox`, and persistence/merge helpers. Onboarding draft storage will be added to this database, scoped by authenticated user ID.
- `src/lib/types.ts` — current `AppData`, `Semester`, `CourseUnit`, `Assessment`, and the authoritative `cgpa`, `semesterGPA`, and course-grade functions.

### Data model and compatibility

The existing profile is part of `AppData.settings`: `profileName`, `university`, and `profilePicture`. The existing semester model contains `academicYear` and `semesterNumber`; course units contain `name`, `creditUnits`, assessments, topics, and documents. The global target is `settings.targetCGPA`. There is no separate profile entity today.

Add optional profile properties `programme`, `yearOfStudy` (1–6), `currentSemester` (1–2), and `academicYear` to settings, while retaining `university` there for existing UI compatibility. A new `cgpa_profiles` Supabase table will be a structured, owner-scoped projection for these profile fields and setup completion time. Existing semester/course/settings records remain unchanged and continue to use the current `save_cgpa_record` path. Grade/CGPA calculation code is not changed.

### Onboarding steps and persistence

1. **Optional setup link** — embed `ImportSetupPage`, reusing its paste-code input, preview, conflict choices, and authenticated import. On successful import, save step 4 as the resume point.
2. **About you** — university (short list plus Other), programme, year, semester, and editable academic year. Save fields in the user-scoped local draft after each edit; on finish copy them to settings and the structured profile row.
3. **Course units** — editable name/credit-unit rows, list paste parsing, and non-blocking validation. Save the draft locally after every edit. On Finish create a semester and courses using existing `addSemester`/`addCourse`; use client-generated IDs and the existing local account outbox.
4. **Target CGPA** — optional goal saved in the draft; on Finish call the existing `setTargetCGPA`/settings update path.
5. **Any results yet?** — optional per-course score input represented as a normal assessment with weight 100 and the entered total. This uses the existing assessment and grade calculation functions.
6. **Finish** — mark the local draft complete, queue profile and CGP records for silent sync, and navigate to Dashboard. The Dashboard’s “Finish setting up” card remains available until the user completes their next setup tasks.

The resumable draft, step index, timestamps, profile draft, course rows, target, and optional scores live in an IndexedDB store keyed by authenticated user ID. The draft is also mirrored into the existing account settings record, so the existing local account outbox syncs it silently when connectivity is available. New profile properties are stored in that same settings JSON payload for cross-platform compatibility. The optional structured Supabase profile projection is protected by RLS and never stores authentication credentials; the flow does not depend on it. Share tokens are not copied into profile fields or analytics.

### Preview, accessibility, and measurement

Use the existing `cgpa`, `runWhatIf`, and semester trend functions for the live preview; do not duplicate or alter grading formulas. The preview shows credit units immediately and projected CGPA/trend when a target or results exist. It is a side panel at desktop widths and a compact summary below the form on phone widths. Controls use existing design tokens, visible labels, keyboard-operable buttons, and a 360 px single-column layout. User-facing degree terminology is “Programme”; modules are “Course units”.

Persist only anonymous counters (step reached, skipped, completed, and elapsed time to first calculated CGPA) locally. Counters contain no account ID, course names, scores, or grades and are not sent to Supabase or an AI model.

### Gentle reminders

Calculate completeness from local profile/course data: profile information, target CGPA, course assessments, and course topics. Dashboard shows one dismissible card with the percentage and one next step. Store last-nudge date, snooze-until date, and dismissal count in the user-scoped local database. Show no more than one reminder per day; Snooze hides it for a day; Dismiss stops reminders after three dismissals. Optional local notifications are available only in the desktop/Android Settings path after explicit opt-in; onboarding never requests notification permission.

### Existing users and launch rule

Only signed-in accounts with no semesters and no completed onboarding are auto-directed to the flow. Existing accounts keep their current route. “Run setup again” is explicitly available in Settings. Closing the app preserves the current step and answers; resuming uses the authenticated account’s local draft.

## Phase 1 migration

`supabase/migrations/20261107200000_onboarding_profiles.sql` creates the structured profile projection with owner-only RLS, direct `auth.uid()` policies, a timestamp trigger, and a sync index. It is idempotent and is intentionally **not applied to any live database**. The app persists profile values and drafts in the existing settings record, so this migration is not required for the onboarding flow.

## Implementation and verification sequence

1. Build and verify the onboarding flow in the Web app first; treat it as the source implementation for Android and Windows ports.
2. Add reminder scheduling and local anonymous measurements.
3. Run focused tests, Web build/type checks, and desktop/mobile builds. Verify fresh-user, import, skip, resume, offline, existing-user, small-screen, and keyboard flows.
4. Record any unmet tests or migration-dependent behavior explicitly; do not claim a native build/device pass without running it.
