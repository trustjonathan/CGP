# CGP Cross-Platform Update Audit

**Audit date:** 9 November 2026  
**Purpose:** Establish the web-app changes and a safe, compatibility-aware sequence for updating the Windows EXE and Android APK while preserving existing behavior.

## Executive summary

The web app contains the completed Phase 1-6 work in commits through `1e9b266`. The follow-on calendar timeline, countdown, assessment-summary, and notification changes are present in the web working tree but are **not committed**. Treat those changes as a candidate port baseline only after they are reviewed and committed as a coherent web release.

No Supabase migration was added for the calendar or programme anchor. The reminder preferences introduced in the calendar flow are local-only. Do not sync these preferences or add a shared database table as part of the EXE/APK port.

The current notification implementation is suitable only as a **while-the-app-is-running** baseline. It does not provide dependable closed-app scheduling for a browser or Electron renderer, and the APK must use Capacitor's native local-notification adapter rather than assuming the browser `Notification` API works in an Android WebView.

## Repository and change state

| Target | Location | Audit state |
|---|---|---|
| Web | `E:\PROJECTS\CGPA tracker Web app` | Git repository, branch `feature/phase-6b-calendar`; committed work through `1e9b266`; current calendar/reminder work is modified/untracked. |
| Windows EXE source | `E:\PROJECTS\CGPA tracker` | Source tree exists; `.git` metadata is absent, so Git history and dirty state could not be audited. No EXE files were edited during this audit. |
| Android APK source | `E:\PROJECTS\CGPA tracker mobile` | Source tree exists; `.git` metadata is absent, so Git history and dirty state could not be audited. No APK files were edited during this audit. |

The target package manifests are not identical:

- Web already declares `date-fns` `^4.4.0` and `react-pdf`.
- EXE and mobile manifests do not directly declare `date-fns` or `react-pdf`; verify the installed dependency tree before reusing those imports/components. Do not assume a transitive copy is a supported direct dependency.
- Mobile declares Capacitor Android/Core `^8.5.0`; its lockfile resolves `@capacitor/app` transitively through other plugins, but it does not directly declare `@capacitor/local-notifications`.
- The Android manifest currently declares `INTERNET` only; no notification permission is present.
- EXE uses Electron `^43.4.1`; its `electron/preload.cjs` exposes document/update APIs but no notification-specific IPC API. Renderer `Notification` may be used while the app runs, subject to OS permission and packaged-app testing.

## Committed web changes made today

| Commit | Change | Port relevance |
|---|---|---|
| `0509163` | Configurable grade targets and centralized grading configuration | Port the shared configuration and compatibility defaults together; do not reintroduce a fixed 5.0 target. |
| `923f0d8` | Shared course forecast logic | Keep Dashboard, course, and simulator forecasts consistent; port the shared pure logic with tests. |
| `9f13fcd` | Collapsible course topics | UI/state behavior only; preserve completion data and course edit behavior. |
| `9c4b6ed` | Navigation/dashboard redesign and Setups page | Port navigation surfaces as a unit; account for native back behavior separately. |
| `b237a38` | Rules and Documents reader | Web added document/PDF UI and dependencies; platform document opening/rendering must be adapted rather than blindly copied. |
| `1344db3` | Kabale 2026/2027 calendar JSON and date-only helpers (Phase 6) | Calendar source and date semantics are foundational; preserve local-date-only handling. |
| `1e9b266` | Restored academic calendar and programme progress | Includes the calendar route and programme anchor/progress surfaces, along with related grading/config updates. |

The above commits were observed in the web log dated 9 November 2026. They are committed web history, not proof that the corresponding code has been ported to either platform.

## Current web working-tree changes (not committed)

The current `git status` contains modified files:

- `src/App.tsx`
- `src/features/calendar/calendar-theme.css`
- `src/features/calendar/calendarModel.test.ts`
- `src/features/calendar/calendarModel.ts`
- `src/pages/CalendarPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/SyncSettingsPage.tsx`

It also contains new, untracked files:

- `src/features/calendar/CalendarReminderScheduler.tsx`
- `src/features/calendar/CalendarTimelineView.tsx`
- `src/features/calendar/calendarReminders.test.ts`
- `src/features/calendar/calendarReminders.ts`
- `src/features/calendar/calendarTimeline.ts`

These are not yet a release baseline. Review and commit them in web first before beginning platform copies, so later ports can reference a stable commit.

### Behavior represented by these changes

1. **Calendar timeline**
   - Priority is derived from milestone type rather than changing the supplied JSON dates: teaching, coursework, deadlines, exams, breaks, and results are primary; administration/reporting/orientation/ceremonies are secondary.
   - Period milestones render as bands, single dates as dots; the timeline has semester/30-day ranges, responsive mobile presentation, labels, week ticks, and an accessible semantic list.
   - Upcoming items are grouped by month, filtered by type, and flagged when secondary.
2. **Calendar countdown**
   - Date-only milestones use 08:00 local time.
   - Countdown wording uses calendar duration for longer spans, days for 8-60 days, day/hour form for short spans, and hh:mm:ss under 24 hours.
   - The hero, upcoming rows, and next-milestone card use the shared formatter.
3. **Coursework summary**
   - The summary is derived from the assessments attached to courses in the selected semester rather than requiring the literal word “Coursework” in the name.
   - Entries named as exams/finals are excluded. The onboarding-only “Current result” item is not treated as a coursework task.
   - Courses with no coursework-like task or with all task marks missing are listed under Needs attention.
4. **Calendar reminders**
   - Per-event enabled IDs and sent IDs are stored in browser `localStorage`, not the synced app settings or Supabase.
   - A date-only milestone is scheduled for 08:00 local time on the preceding day; the ID is stable as `<eventId>:1d`.
   - The event-detail switch requests browser notification permission in context.
   - An app-shell scheduler checks for due reminders while the page is running, on a 30-second interval, and when the page becomes visible.
   - A notification click returns to the calendar with the event query parameter.
5. **Setup notifications**
   - The setup reminder permission/request path is no longer gated on Electron's `window.desktopApp`; it uses the standard `Notification` API when available.

### Important limitations and follow-up checks

- **Closed app/tab:** the scheduler uses a renderer timer. It cannot deliver reliably when the web tab or Electron app is closed. Do not describe this as native scheduled delivery.
- **APK:** no native local-notification plugin, request flow, schedule/cancel adapter, or Android notification permission was added. The web `Notification` path must not be used as the APK's delivery guarantee.
- **Reminder preferences:** localStorage is per origin/app installation, not account-scoped in the current implementation. If multiple accounts share the same app profile, decide whether preferences should be namespaced locally by user ID before shipping.
- **Delivery retry:** the current scheduler records a reminder as sent before constructing the notification. If notification creation fails, that reminder may not be retried. Fix this ordering in the web baseline before copying the scheduler.
- **Hero ticking:** verify a page opened more than 24 hours before a milestone. The interval currently starts only when its effect runs and sees a countdown within 24 hours; without a re-evaluation trigger it may not begin ticking at the boundary.
- **No bundle-size comparison:** today's production build completed, but there is no before/after baseline for measuring the feature's bundle delta.
- **Visual/platform validation:** the shared browser was on the sign-in screen; calendar UI screenshots and notification delivery were not verified in the authenticated browser. APK and packaged EXE were not built or tested today.

## Validation completed on the web tree

- `npm run build` — passed; Vite reported the existing large-chunk warning. Main bundle output was about 1.22 MB minified / 342 KB gzip; PDF reader chunk about 471 KB / 139 KB gzip. No prior comparison was captured.
- `npm run typecheck -- --pretty false` — passed.
- Focused calendar tests (`calendarModel.test.ts`, `calendarReminders.test.ts`) — 10 tests passed.
- `npm run test` — passed: 18 Vitest tests and 22 Node tests.
- ESLint on the changed calendar files — passed.
- `git diff --check` — passed.
- Not tested: signed-in visual flow, actual OS notifications, closed-app notifications, Android APK, packaged Windows EXE, offline native scheduling.

## Compatibility-aware port sequence

Use the steps below in order. Keep EXE and APK changes isolated, and test after each step; do not copy the full web tree in one pass.

### Step 0 — Establish a safe baseline

1. Review and commit the web timeline/reminder work after fixing the retry and hero-timer limitations above.
2. Create versioned Git branches or backups for the EXE and mobile trees before edits; neither target directory currently has `.git` metadata.
3. Record current app versions, package lockfiles, Capacitor/Electron versions, and native build outputs.
4. Keep sync/outbox, auth, Supabase migrations, and shared server schema unchanged. None is needed for calendar or local reminder preferences.

### Step 1 — Port grading configuration and forecasts

1. Port the centralized grade scale, configurable targets, settings types, and forecast functions as one logical unit.
2. Preserve compatibility defaults for existing records with missing target fields; explicitly retain legacy user-selected targets.
3. Confirm no hardcoded 5.0/80% target assumptions remain in UI or simulator calculations.
4. Run target-boundary, forecast, Dashboard, course, and simulator tests before continuing.

### Step 2 — Port topics and navigation surfaces

1. Port collapsible topic behavior without changing stored topic completion.
2. Port Dashboard/Setups/navigation changes while respecting the target's router and shell.
3. On APK, use Capacitor App back-button handling and close overlays before navigating; do not rely on browser history length alone.
4. On EXE, validate Alt+Left and mouse back in the packaged app. Keep Electron main-process changes separate unless actual testing demonstrates they are required.

### Step 3 — Port Rules & Documents with platform adapters

1. Port document content/configuration independently from the renderer.
2. Check if `react-pdf` is installed and supported by each target before using it. The EXE/mobile manifests do not directly list it.
3. Preserve existing file-open/share behavior; use the mobile file-opener/native viewing path where appropriate.
4. Verify offline access and packaged file paths before moving on.

### Step 4 — Port calendar data and date-only model

1. Copy `src/data/calendars/kabale-2026-2027.json` unchanged.
2. Port the pure helpers and tests before the page.
3. EXE/mobile manifests do not directly declare `date-fns`, even though lockfiles may contain transitive copies. Add a direct dependency only after confirming the resolved version, or provide an equivalent tested implementation; do not rely on an accidental transitive import.
4. Preserve `YYYY-MM-DD` as a local date-only value. Never parse these calendar values as UTC instants for rendering or comparison.
5. Verify the 2026-11-09 acceptance examples and test at non-UTC device offsets.

### Step 5 — Port programme anchor and calendar page

1. Keep the programme anchor inside the existing local/synced settings record shape; no database migration is indicated by the web implementation.
2. Preserve formula behavior: `semestersDone = (year - 1) * 2 + (semester - 1)`, remaining count includes the current semester, and finish date is an estimate based on the calendar pattern.
3. Preserve max-stay validation and manual finish-date override.
4. Port timeline behavior and CSS after the model. Check narrow widths, keyboard access, reduced motion, light/dark theme, and offline calendar operation.

### Step 6 — Implement notifications per platform

**Shared logic**

1. Keep schedule calculation pure and covered by tests. Current baseline is one reminder per event, stable event ID plus `1d`, 08:00 device-local fire time on the previous day.
2. Store preferences per device only. Do not put reminder choices into Supabase or shared course/settings payloads.
3. Add a platform adapter boundary for permission, schedule, cancel, and notification tap/deep-link handling.
4. Make scheduling idempotent and ensure failed scheduling is retryable; only mark a reminder delivered after the platform accepts it.

**Windows EXE**

1. First validate renderer `Notification` with permission while the packaged EXE is running.
2. Decide separately whether notifications must run after the app closes. That requires an explicit Electron lifecycle/tray/launch-at-login design; the current web renderer timer cannot do it.
3. Do not alter `electron/main.cjs` or preload until packaged tests demonstrate a need.

**Android APK**

1. Add `@capacitor/local-notifications` as a direct, version-compatible dependency for Capacitor 8, then run `cap sync android`.
2. Request notification permission only when the user turns reminders on. Provide a denied state and device-settings route.
3. Account for Android 13+ `POST_NOTIFICATIONS`, and decide exact versus inexact alarms based on the reminder precision/power policy. Do not claim exact delivery unless permission and platform behavior support it.
4. Rebuild/reconcile pending notifications after app edits/updates and test reboot behavior on the supported Android versions.
5. Convert stable string reminder IDs into deterministic native numeric IDs with collision handling. Persist the mapping locally so edits cancel/update the correct pending native notification.
6. Test notification taps opening the correct event, duplicate prevention, permission denial, reboot, timezone/DST transitions, and closed-app delivery.

## Acceptance gate before releasing EXE/APK updates

- Target configuration/forecast behavior matches web tests and existing saved data.
- Calendar date-only examples pass on the target device timezone.
- Assessment summary follows actual course-unit assessment records and excludes exams/finals.
- Timeline works at 360 px and desktop widths; light/dark and keyboard checks pass.
- Reminder toggle reflects permission state; scheduling is idempotent and local-only.
- EXE packaged notification test and APK native notification test are both documented separately.
- Offline mode still opens the calendar and calculates countdowns.
- No sync/outbox/auth behavior or database migrations changed as an unintended side effect.
- Final artifacts are built from the intended platform-specific branches and recorded with the source commit/hash.
