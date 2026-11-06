# CGP production audit — Phase 0

Audit date: 2026-11-06

Scope: the current contents of `E:\PROJECTS\CGPA tracker` (desktop/web source),
`E:\PROJECTS\CGPA tracker mobile` (Capacitor Android source), and
`E:\PROJECTS\CGPA tracker Web app` (Git-managed web source). This is a static
code and migration audit plus the baseline build/test commands listed below.
No live Supabase schema or physical-device measurements were available.

| # | Status | Area | Evidence |
|---|---|---|---|
| 1 | Partial | Architecture and versions | Root uses Vite/React and Electron Builder/NSIS (`E:\PROJECTS\CGPA tracker\package.json`, `vite.config.ts`, `electron\main.cjs`, `Dockerfile`); Android uses Vite + Capacitor and Gradle (`E:\PROJECTS\CGPA tracker mobile\capacitor.config.ts`, `android\app\build.gradle`); Web app uses Vite and Docker/Nginx (`E:\PROJECTS\CGPA tracker Web app\Dockerfile`, `nginx.conf`). Production builds succeeded for all three folders. Versions are inconsistent: root/Android package `1.0.4`, Android `versionCode 5`, Web app package `1.0.0`; root has Windows NSIS output and `latest.yml` identifies `1.0.4`. The current version is surfaced in the root/Android update status, but not consistently on all targets. No web deployment workflow was found. |
| 2 | Partial | Offline-first sync (exe/APK) | Root and Android implement account-scoped IndexedDB records/outbox, client UUIDs, boolean tombstones, one `cgpa_records` cursor, revision-based conflict detection, and local persistence before remote sync (`src\lib\accountSync.ts`, `src\lib\useAppData.ts`, `src\lib\supabaseSync.ts`). Cloud load, realtime, session initialization and release checks use an 8-second delayed idle scheduler (`src\lib\startup.ts`). Offline network errors clear sync errors in the UI, though offline failures are still written to the console. The sync permission dialog is not rendered; sync starts after a cloud load. Soft-deletes have no server `deleted_at`. Web app instead starts from in-memory empty data and fetches Supabase (`Web app\src\lib\useAppData.ts`), so it is not offline-first. Root tests: 9/9 passed; Android tests: 3/3 passed; these are unit tests, not offline end-to-end coverage. |
| 3 | Missing | Startup timings and deferred work | Source defers cloud loading/session refresh/release checks, but no cold/warm timing was measured on the requested web, Android, or Windows devices. Electron updater checking is scheduled after window load; session/network scheduling is code-based, not verified against first-paint or idle measurements (`electron\main.cjs`, `src\lib\startup.ts`, `src\contexts\AuthContext.tsx`, `src\lib\useAppData.ts`). |
| 4 | Partial | Session persistence and account isolation | Root/Android read the persisted Supabase session locally and namespace IndexedDB records/outbox/import markers by user ID; the root `AppDataProvider` is keyed by user ID, and refresh rejection is distinguished from offline errors (`src\lib\supabase.ts`, `src\contexts\AuthContext.tsx`, `src\lib\accountSync.ts`, `src\App.tsx`). Electron stores session tokens using `safeStorage`; Android currently stores its Supabase session in `localStorage` (`mobile\src\lib\supabase.ts`). Web app uses Supabase `getSession()` then blocks its workspace on cloud fetch, with no offline local account cache. No sign-out/account-switch isolation scenario was run. |
| 5 | Broken | Database, RLS and sync metadata | The root has only the initial `cgpa_records` migration; its share and Help schemas are review proposals, not migrations (`E:\PROJECTS\CGPA tracker\supabase\migrations\20260821000000_cgpa_sync.sql`, `supabase\proposals\shared_setups_phase1.sql`, `supabase\proposals\help_assistant_phase3.sql`). The Web app adds revision/conflict RPCs in a non-idempotent migration (`Web app\supabase\migrations\20261105182000_cgpa_records_revision_conflicts.sql`); the Android migration folder contains unrelated poultry-marketplace migrations. The sync table has `updated_at` and `is_deleted`, but no `deleted_at`; no live database/role test was run. The new Phase 1 migrations and verification script are therefore required before enabling these features. |
| 6 | Broken | Share / import setup | Root and Android have payload allowlisting/validation, preview/conflict choices, local idempotence markers and offline local import after a successful fetch (`src\lib\sharedSetup.ts`, `src\pages\ShareSetupPage.tsx`, `src\pages\ImportSetupPage.tsx`, `src\lib\accountSync.ts`). The proposed RPC uses 128-bit random tokens, stores SHA-256 hashes, sanitizes returned fields, and includes expiry/revocation/lookup limits, but it is not installed as a migration. The Web app has no share/import pages. Deep-link delivery is not wired for Android or Electron; the import paste-code screen is present in the newer renderer. Existing tests cover payload parsing only (root: 6 shared-setup tests). |
| 7 | Partial | Help assistant | Root/Android provide offline FAQs, route-aware suggestions, a set-up checklist, and Help & Privacy content from `src\help\knowledge.json`; tests confirm the frontend and Edge Function copies are identical. The Edge Function sanitizes/filters the typed question, uses only its bundled knowledge JSON, and rate-limits by user/IP (`supabase\functions\help\index.ts`). Its required rate-limit/cache tables and RPCs are only in a proposal, so deployed AI requests are not proven to work. There are separate copies of the knowledge file, and the Web app has a different static Help page. No FAQ, AI, injection, or rate-limit end-to-end test was run. |
| 8 | Partial | Update pipeline | Electron uses `electron-updater` with automatic download and install-on-quit, configured for GitHub releases (`package.json`, `electron\main.cjs`); web/Android can check GitHub release metadata, and Android exposes an APK download link (`src\lib\useReleaseUpdates.ts`, `mobile\src\components\Sidebar.tsx`). Existing Windows release metadata is version `1.0.4`. No GitHub Actions workflow exists; APK release signing is a local script with a developer-specific keystore path, and the v1.0.0-to-v1.0.1 update flow was not exercised. |
| 9 | Missing | Visual parity | Root/Android have the newer share/import, Help assistant and sync-settings surfaces; the Web app is an older, materially different UI with no share/import page, floating assistant, or sync-settings page. No reference screenshots or target-size screenshots exist in the checked-in projects. Baseline production builds pass, but pixel/interaction parity was not visually tested. |

## Baseline verification

- `E:\PROJECTS\CGPA tracker`: `npm test` passed (9 tests); `npm run build`
  passed; `npm run typecheck` failed with five existing type errors in
  `src/components/MultiVaultManager.tsx` (lines 458, 463, 468, 488, 510).
- `E:\PROJECTS\CGPA tracker mobile`: `npm test` passed (3 tests);
  `npm run build` and `npm run typecheck` passed.
- `E:\PROJECTS\CGPA tracker Web app`: `npm run build` passed; there is no test
  script; `npm run typecheck` failed with the same five
  `src/components/MultiVaultManager.tsx` type errors.
- Root and Android `npm run test:help-content` passed and confirmed the three
  bundled Help knowledge copies are identical.
- All successful builds emitted only the existing Browserslist/chunk-size
  warnings.

## Uncertainties and constraints

- No live Supabase connection/schema inspection or authenticated two-user test
  was performed. Database findings refer to checked-in migrations/proposals.
- Cold/warm startup measurements require the user's web, Android and Windows
  test devices; no hardware timing is claimed.
- Only `E:\PROJECTS\CGPA tracker Web app` is a Git repository, and it has
  pre-existing staged changes in `README.md`, `src/App.tsx`,
  `src/components/AuthScreen.tsx`, and `src/components/SyncStatusToast.tsx`.
  The root and Android folders have no Git metadata. Those staged files were
  not modified.
- The initial task text was truncated during Phase 0 item 7. Items 8 and 9 are
  interpreted as the update pipeline and UI parity, respectively, based on the
  explicit Phase 2–4 references.

## Phase 1 — database migration handoff

Drafted three idempotent migrations for sync/RLS hardening, Share/Import, and
the Help service tables/RPCs, plus a rollback-only authenticated-role
verification script. The migrations have **not** been applied. A read-only
`supabase db lint --local` attempt could not connect to PostgreSQL at
`127.0.0.1:54322` (`ECONNREFUSED`); no SQL parser or live database validation
was available. Replace the two placeholder user UUIDs in
`supabase/verification/production_hardening.sql` with existing test accounts
before running it in a disposable Supabase project.

Post-draft validation:

- Desktop: tests 9/9 and production build passed; typecheck remains blocked by
  the same five existing `MultiVaultManager.tsx` errors listed above.
- Android: tests 3/3, production build, and typecheck passed.
- Web: production build passed; there is no test script; typecheck has the same
  five existing errors.
- A Phase 1 commit was not created. The Web app repository already contains
  unrelated staged user changes, the other two target folders have no Git
  metadata, and the attempted follow-up Git operation was denied.
