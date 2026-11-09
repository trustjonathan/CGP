import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
} from 'lucide-react';
import calendarDataJson from '@/data/calendars/kabale-2026-2027.json';
import {
  getCalendarIntervalDuration,
  parseCalendarDate,
  type AcademicCalendar,
  type AcademicCalendarSemester,
} from '@/lib/academicCalendar';

const calendarData = calendarDataJson as AcademicCalendar;
import { useAppData } from '@/lib/useAppData';
import {
  formatCountdown,
  getCourseworkProgress,
  getLocalCalendarDate,
  deriveJoinedAcademicYear,
  programmeRemaining,
  getSelectedCalendarSemester,
  getSemesterCalendarEvents,
  getUpcomingCalendarMilestones,
  validateProgrammeAnchor,
} from '@/features/calendar/calendarModel';
import { getCalendarWeekLabel } from '@/features/calendar/calendarTimeline';
import { CalendarTimeline } from '@/features/calendar/CalendarTimelineView';
import '@/features/calendar/calendar-theme.css';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseCalendarDate(value)).replace(',', '');
}

function durationLabel(start: string, end: string) {
  const duration = getCalendarIntervalDuration(start, end);
  const parts = [
    duration.years ? `${duration.years} year${duration.years === 1 ? '' : 's'}` : '',
    duration.months ? `${duration.months} month${duration.months === 1 ? '' : 's'}` : '',
    !duration.years && !duration.months && duration.days
      ? `${duration.days} day${duration.days === 1 ? '' : 's'}`
      : '',
  ].filter(Boolean);
  return parts.length ? `About ${parts.join(', ')} from today` : 'Finishes today';
}

function eventMarkerColor(type: string) {
  if (type === 'exam') return 'bg-warning-500';
  if (type === 'coursework') return 'bg-primary-600';
  if (type === 'deadline' || type === 'results') return 'bg-accent-600';
  if (type === 'ceremony') return 'bg-success-600';
  return 'bg-ink-500';
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function CalendarPage() {
  const { data, updateSettings } = useAppData();
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [upcomingFilter, setUpcomingFilter] = useState<'all' | 'coursework' | 'exam' | 'results' | 'admin'>('all');
  const today = getLocalCalendarDate();

  const semester = getSelectedCalendarSemester(today);
  const calendarSemester: AcademicCalendarSemester | null = semester
    ? (calendarData.semesters.find((item) => item.number === semester.number) as AcademicCalendarSemester | undefined) ?? null
    : null;
  const programmeAnchor = data.settings.programmeAnchor ?? null;
  const [showAnchorPrompt, setShowAnchorPrompt] = useState(false);
  const [promptYear, setPromptYear] = useState('');
  const [promptSemester, setPromptSemester] = useState('');
  const [promptError, setPromptError] = useState('');
  const promptKey = calendarSemester
    ? `cgp-programme-anchor:${calendarData.academicYear}:${calendarSemester.number}:${calendarSemester.start}`
    : '';

  useEffect(() => {
    if (!programmeAnchor || !calendarSemester || today < calendarSemester.start) {
      setShowAnchorPrompt(false);
      return;
    }
    if (programmeAnchor.academicYear === calendarData.academicYear
      && programmeAnchor.semester === calendarSemester.number) {
      setShowAnchorPrompt(false);
      return;
    }
    try {
      if (window.localStorage.getItem(promptKey) === 'dismissed') {
        setShowAnchorPrompt(false);
        return;
      }
    } catch (error) {
      console.error('Unable to read the programme confirmation preference.', error);
    }
    setPromptYear(String(programmeAnchor.year));
    setPromptSemester(String(calendarSemester.number));
    setPromptError('');
    setShowAnchorPrompt(true);
  }, [
    calendarSemester,
    programmeAnchor,
    promptKey,
    today,
  ]);

  const dismissAnchorPrompt = () => {
    try {
      window.localStorage.setItem(promptKey, 'dismissed');
    } catch (error) {
      console.error('Unable to save the programme confirmation preference.', error);
    }
    setShowAnchorPrompt(false);
  };

  const confirmAnchor = () => {
    if (!programmeAnchor) return;
    const year = Number(promptYear);
    const semesterNumber = Number(promptSemester);
    const validation = validateProgrammeAnchor(year, programmeAnchor.programDurationYears);
    if (validation.severity === 'error') {
      setPromptError(validation.message ?? 'Enter valid programme details.');
      return;
    }
    if (!Number.isInteger(semesterNumber) || semesterNumber < 1 || semesterNumber > 2) {
      setPromptError('Choose your current semester from 1 to 2.');
      return;
    }
    updateSettings({
      academicYear: calendarData.academicYear,
      yearOfStudy: year,
      currentSemester: semesterNumber,
      programmeAnchor: {
        ...programmeAnchor,
        academicYear: calendarData.academicYear,
        year,
        semester: semesterNumber,
      },
      programmeJoinedAcademicYear: data.settings.programmeJoinedAcademicYear
        ?? deriveJoinedAcademicYear(calendarData.academicYear, year),
    });
    dismissAnchorPrompt();
  };

  const upcomingMilestones = getUpcomingCalendarMilestones(today, 100);
  const nextMilestone = upcomingMilestones[0] ?? null;
  const upcomingFilterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Coursework', value: 'coursework' },
    { label: 'Exams', value: 'exam' },
    { label: 'Results', value: 'results' },
    { label: 'Admin', value: 'admin' },
  ] as const;
  const filteredUpcomingMilestones = upcomingMilestones.filter((milestone) => {
    if (upcomingFilter === 'all') return true;
    if (upcomingFilter === 'coursework') return milestone.type === 'coursework' || milestone.type === 'deadline';
    if (upcomingFilter === 'exam') return milestone.type === 'exam';
    if (upcomingFilter === 'results') return milestone.type === 'results' || milestone.type === 'deadline';
    if (upcomingFilter === 'admin') return milestone.type === 'admin' || milestone.type === 'ceremony';
    return true;
  });
  const upcomingGroups = Object.entries(
    filteredUpcomingMilestones.reduce<Record<string, typeof filteredUpcomingMilestones>>((groups, milestone) => {
      const key = new Date(
        parseCalendarDate(milestone.date).getFullYear(),
        parseCalendarDate(milestone.date).getMonth(),
        parseCalendarDate(milestone.date).getDate(),
      );
      const label = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(key);
      groups[label] ??= [];
      groups[label].push(milestone);
      return groups;
    }, {}),
  ).map(([label, items]) => ({ label, items }));

  useEffect(() => {
    if (!nextMilestone) return undefined;
    const nextMilestoneDate = new Date(
      parseCalendarDate(nextMilestone.date).getFullYear(),
      parseCalendarDate(nextMilestone.date).getMonth(),
      parseCalendarDate(nextMilestone.date).getDate(),
      8,
      0,
      0,
    );
    const diffMs = nextMilestoneDate.getTime() - liveNow.getTime();
    if (diffMs <= 0 || diffMs > 24 * 60 * 60 * 1000) return undefined;
    const timer = window.setInterval(() => setLiveNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [liveNow, nextMilestone]);

  const selectedSemester: AcademicCalendarSemester | null = semester
    ? (calendarData.semesters.find((item) => item.number === semester.number) as AcademicCalendarSemester | undefined) ?? null
    : null;
  const appSemester = selectedSemester
    ? data.semesters.find((item) => item.semesterNumber === selectedSemester.number
      && item.academicYear.trim() === calendarData.academicYear)
    : null;
  const semesterCourses = appSemester
    ? data.courses.filter((course) => course.semesterId === appSemester.id)
    : [];
  const courseworkProgress = getCourseworkProgress(semesterCourses);
  const programmeProgress = programmeAnchor
    ? programmeRemaining(programmeAnchor, today)
    : null;
  const totalSemesters = programmeAnchor ? programmeAnchor.programDurationYears * 2 : null;
  const semesterEvents = selectedSemester ? getSemesterCalendarEvents(selectedSemester.number) : [];
  const finishOverride = data.settings.programmeFinishDateOverride ?? '';
  let validFinishOverride = finishOverride;
  if (finishOverride) {
    try {
      parseCalendarDate(finishOverride);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      validFinishOverride = '';
    }
  }
  const finishDate = validFinishOverride || programmeProgress?.finishDate || null;
  const durationText = finishDate
    ? finishDate >= today ? durationLabel(today, finishDate) : 'This date has passed.'
    : null;

  return (
    <div className="calendar-page relative isolate -mx-4 -my-6 min-h-[calc(100vh-3.5rem)] overflow-hidden px-4 py-6 text-ink-900 dark:text-ink-50 sm:-mx-6 sm:px-6 sm:py-8 lg:-mx-8 lg:px-8">
      <div className="calendar-background" aria-hidden="true">
        <div className="calendar-dot-layer" />
        <div className="calendar-glow-layer" />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl space-y-6">
        <header className="relative overflow-hidden rounded-3xl border border-primary-200/70 bg-white/80 p-5 shadow-sm dark:border-ink-700 dark:bg-ink-900/80 sm:p-8">
          <div className="relative max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800 dark:bg-primary-900/50 dark:text-primary-200">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {calendarData.academicYear} calendar
            </p>
            <p className="mt-4 text-sm font-semibold text-primary-800 dark:text-primary-200">
              {semester ? `Semester ${semester.number} · ${getCalendarWeekLabel(today, semester.weekStart)}` : 'Academic calendar'}
            </p>
            <h1 className="mt-2 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight text-ink-950 dark:text-white sm:text-4xl">
              {nextMilestone
                ? `${nextMilestone.label} in ${formatCountdown(nextMilestone.date, liveNow)}`
                : 'No more milestones scheduled'}
            </h1>
            <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">
              {nextMilestone
                ? `Starts ${formatDate(nextMilestone.date)}`
                : `${calendarData.university} · ${calendarData.academicYear}`}
            </p>
          </div>
        </header>

        {showAnchorPrompt && programmeAnchor && calendarSemester && (
          <section className="rounded-2xl border border-warning-300 bg-warning-50/95 p-4 shadow-sm dark:border-warning-800 dark:bg-warning-950/90 sm:p-5" aria-labelledby="programme-anchor-prompt-title">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                <h2 id="programme-anchor-prompt-title" className="font-display font-semibold text-ink-900 dark:text-ink-50">
                  A new semester has started. Is your programme year still up to date?
                </h2>
                <p className="mt-1 text-sm leading-6 text-ink-700 dark:text-ink-200">
                  Confirm or update your current year and semester. Your progress will not change until you confirm.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={dismissAnchorPrompt}>Not now</button>
                <button type="button" className="btn-primary" onClick={confirmAnchor}>Confirm details</button>
              </div>
            </div>
            <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="calendar-anchor-year" className="label">Current year</label>
                <select id="calendar-anchor-year" className="input" value={promptYear} onChange={(event) => setPromptYear(event.target.value)}>
                  {[1, 2, 3, 4, 5, 6].map((year) => <option key={year} value={year}>Year {year}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="calendar-anchor-semester" className="label">Current semester</label>
                <select id="calendar-anchor-semester" className="input" value={promptSemester} onChange={(event) => setPromptSemester(event.target.value)}>
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </select>
              </div>
            </div>
            {validateProgrammeAnchor(Number(promptYear), programmeAnchor.programDurationYears).message && (
              <p className={`mt-3 text-sm ${validateProgrammeAnchor(Number(promptYear), programmeAnchor.programDurationYears).severity === 'error' ? 'text-error-700' : 'text-warning-700'}`}>
                {validateProgrammeAnchor(Number(promptYear), programmeAnchor.programDurationYears).message}
              </p>
            )}
            {promptError && <p className="mt-3 text-sm text-error-700" role="alert">{promptError}</p>}
          </section>
        )}

        {semester && (
          <CalendarTimeline
            semester={semester}
            events={semesterEvents}
            today={today}
          />
        )}

        <section className="grid gap-4 md:grid-cols-3" aria-label="Calendar summary">
          <article className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-sm dark:border-ink-700 dark:bg-ink-900/90">
            <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              <h2 className="font-display font-semibold text-ink-900 dark:text-ink-50">Coursework tasks done</h2>
            </div>
            <p className="mt-4 font-display text-3xl font-bold tabular-nums text-ink-900 dark:text-ink-50">
              {courseworkProgress.completed}<span className="text-lg font-medium text-ink-500 dark:text-ink-300"> / {courseworkProgress.total}</span>
            </p>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              {courseworkProgress.total
                ? 'Coursework, CAT, test and assignment marks entered for this semester.'
                : 'Add coursework assessments, CATs, tests or assignments to courses in this semester.'}
            </p>
          </article>

          <article className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-sm dark:border-ink-700 dark:bg-ink-900/90">
            <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300">
              <Clock3 className="h-5 w-5" aria-hidden="true" />
              <h2 className="font-display font-semibold text-ink-900 dark:text-ink-50">Next milestone</h2>
            </div>
            {nextMilestone ? (
              <>
                <p className="mt-4 line-clamp-2 font-display text-lg font-semibold text-ink-900 dark:text-ink-50">{nextMilestone.label}</p>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                  {formatDate(nextMilestone.date)} · {formatCountdown(nextMilestone.date, today)}
                </p>
              </>
            ) : <p className="mt-4 text-sm text-ink-600 dark:text-ink-300">No more milestones are scheduled.</p>}
          </article>

          <article className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-sm dark:border-ink-700 dark:bg-ink-900/90">
            <div className="flex items-center gap-2 text-warning-700 dark:text-warning-300">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
              <h2 className="font-display font-semibold text-ink-900 dark:text-ink-50">Needs attention</h2>
            </div>
            {courseworkProgress.coursesNeedingMarks.length ? (
              <ul className="mt-3 space-y-2">
                {courseworkProgress.coursesNeedingMarks.slice(0, 3).map((course) => (
                  <li key={course.id}>
                    <Link to={`/course/${course.id}`} className="text-sm font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300">
                      {course.name}
                    </Link>
                  </li>
                ))}
                {courseworkProgress.coursesNeedingMarks.length > 3 && (
                  <li className="text-xs text-ink-500 dark:text-ink-300">
                    +{courseworkProgress.coursesNeedingMarks.length - 3} more courses
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-ink-600 dark:text-ink-300">
                {semesterCourses.length
                  ? 'All linked courses have coursework marks.'
                  : 'No courses are linked to this calendar semester yet.'}
              </p>
            )}
          </article>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
          <section className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-sm dark:border-ink-700 dark:bg-ink-900/90 sm:p-6" aria-labelledby="upcoming-milestones-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="upcoming-milestones-title" className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">Upcoming</h2>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">All scheduled milestones, including reporting and university events.</p>
              </div>
              <CalendarDays className="h-5 w-5 text-primary-700 dark:text-primary-300" aria-hidden="true" />
            </div>
            {upcomingMilestones.length ? (
              <>
                <div className="mt-4 flex flex-wrap gap-2" aria-label="Milestone filters">
                  {upcomingFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setUpcomingFilter(option.value)}
                      className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${upcomingFilter === option.value
                        ? 'border-primary-200 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                        : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 max-h-[22rem] overflow-y-auto pr-1">
                  {upcomingGroups.map(({ label, items }) => (
                    <div key={label} className="mb-4 last:mb-0">
                      <div className="sticky top-0 z-10 mb-2 rounded-md bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500 dark:bg-ink-900/90 dark:text-ink-300">
                        {label}
                      </div>
                      <ol className="space-y-2">
                        {items.map((milestone) => (
                          <li key={milestone.id} className="flex items-start gap-3 rounded-xl border border-ink-100 px-2 py-2 dark:border-ink-700">
                            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${eventMarkerColor(milestone.type)}`} aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{milestone.label}</p>
                                {milestone.priority === 'secondary' && (
                                  <span className="rounded-full border border-ink-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500 dark:border-ink-600 dark:text-ink-300">
                                    Secondary
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-300">
                                {formatDate(milestone.date)}{milestone.semesterNumber ? ` · Semester ${milestone.semesterNumber}` : ''}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800 dark:bg-primary-900/50 dark:text-primary-200">
                              {formatCountdown(milestone.date, today)}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-4 rounded-xl bg-ink-50 p-4 text-sm text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                There are no upcoming dates in this academic calendar.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-sm dark:border-ink-700 dark:bg-ink-900/90 sm:p-6" aria-labelledby="programme-progress-title">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary-700 dark:text-primary-300" aria-hidden="true" />
              <h2 id="programme-progress-title" className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                Programme progress
              </h2>
            </div>
            {programmeAnchor && programmeProgress
              && programmeProgress.semestersDone !== null
              && programmeProgress.semestersLeft !== null
              && totalSemesters !== null ? (
              <>
                <p className="mt-5 font-display text-2xl font-bold tabular-nums text-ink-900 dark:text-ink-50">
                  {programmeProgress.semestersDone} of {totalSemesters} semesters done
                </p>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                  {programmeProgress.semestersLeft} semester{programmeProgress.semestersLeft === 1 ? '' : 's'} left, including your current semester.
                </p>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700"
                  role="progressbar"
                  aria-label="Programme semesters completed"
                  aria-valuemin={0}
                  aria-valuemax={totalSemesters}
                  aria-valuenow={Math.min(totalSemesters, Math.max(0, programmeProgress.semestersDone))}
                >
                  <div
                    className="h-full rounded-full bg-primary-600"
                    style={{
                      width: `${clampPercent((programmeProgress.semestersDone / totalSemesters) * 100)}%`,
                    }}
                  />
                </div>
                {programmeProgress.validationMessage && (
                  <p className="mt-3 text-sm text-warning-700 dark:text-warning-300" role="status">
                    {programmeProgress.validationMessage}
                  </p>
                )}
                {finishOverride && !validFinishOverride && (
                  <p className="mt-3 text-sm text-error-700 dark:text-error-300" role="alert">
                    Your saved finish date is invalid. Update it in Settings to use the programme estimate.
                  </p>
                )}
                {finishDate ? (
                  <div className="mt-4 rounded-xl bg-primary-50 p-3 dark:bg-primary-900/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-800 dark:text-primary-200">
                      {validFinishOverride ? 'Planned finish date' : 'Finish estimate'}
                    </p>
                    <p className="mt-1 font-semibold text-ink-900 dark:text-ink-50">{formatDate(finishDate)}</p>
                    <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-300">{durationText}</p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-ink-600 dark:text-ink-300">
                    The finish estimate is not available for this academic year.
                  </p>
                )}
              </>
            ) : (
              <div className="mt-4 rounded-xl bg-ink-50 p-4 dark:bg-ink-800">
                {programmeProgress?.validationMessage ? (
                  <p className="text-sm leading-6 text-error-700 dark:text-error-300" role="alert">
                    {programmeProgress.validationMessage}
                  </p>
                ) : (
                  <p className="text-sm leading-6 text-ink-600 dark:text-ink-300">
                    Add your current year, semester and programme duration to see your progress and finish estimate.
                  </p>
                )}
                <Link to="/settings" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300">
                  Set programme details <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>
        </div>

        <Link
          to="/settings/sync"
          className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white/90 px-4 py-3 text-sm font-semibold text-primary-700 shadow-sm hover:bg-white dark:border-ink-700 dark:bg-ink-900/90 dark:text-primary-300 dark:hover:bg-ink-800"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          Reminder settings
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
