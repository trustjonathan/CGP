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
import calendarData from '@/data/calendars/kabale-2026-2027.json';
import {
  getCalendarIntervalDuration,
  getCalendarWeekNumber,
  getDaysUntilCalendarDate,
  parseCalendarDate,
} from '@/lib/academicCalendar';
import { useAppData } from '@/lib/useAppData';
import {
  getCourseworkProgress,
  getLocalCalendarDate,
  getMilestoneDaysRemaining,
  deriveJoinedAcademicYear,
  programmeRemaining,
  getSelectedCalendarSemester,
  getSemesterCalendarEvents,
  getUpcomingCalendarMilestones,
  validateProgrammeAnchor,
} from '@/features/calendar/calendarModel';
import '@/features/calendar/calendar-theme.css';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseCalendarDate(value)).replace(',', '');
}

function countdownLabel(days: number) {
  if (days === 0) return 'Today';
  return `${days} day${days === 1 ? '' : 's'}`;
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
  const today = getLocalCalendarDate();
  const semester = getSelectedCalendarSemester(today);
  const calendarSemester = semester
    ? calendarData.semesters.find((item) => item.number === semester.number) ?? null
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

  const upcomingMilestones = getUpcomingCalendarMilestones(today, 5);
  const nextMilestone = upcomingMilestones[0] ?? null;
  const selectedSemester = semester
    ? calendarData.semesters.find((item) => item.number === semester.number)
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
  const semesterEvents = selectedSemester
    ? getSemesterCalendarEvents(selectedSemester.number)
    : [];
  const semesterDays = semester
    ? Math.max(1, getDaysUntilCalendarDate(semester.end, parseCalendarDate(semester.start)))
    : 1;
  const remainingDays = semester
    ? getDaysUntilCalendarDate(semester.end, parseCalendarDate(today))
    : 0;
  const semesterProgress = clampPercent(((semesterDays - remainingDays) / semesterDays) * 100);
  const exam = semesterEvents.find((event) => event.type === 'exam' && event.endDate);
  const examStartPosition = exam && semester
    ? clampPercent((getDaysUntilCalendarDate(exam.date, parseCalendarDate(semester.start)) / semesterDays) * 100)
    : 0;
  const examEndPosition = exam && semester && exam.endDate
    ? clampPercent((getDaysUntilCalendarDate(exam.endDate, parseCalendarDate(semester.start)) / semesterDays) * 100)
    : 0;
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
              {semester ? `Semester ${semester.number} · Week ${Math.max(0, getCalendarWeekNumber(today, semester.weekStart))}` : 'Academic calendar'}
            </p>
            <h1 className="mt-2 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight text-ink-950 dark:text-white sm:text-4xl">
              {nextMilestone
                ? `${nextMilestone.label} ${getMilestoneDaysRemaining(nextMilestone.date, today) === 0 ? 'is today' : `in ${getMilestoneDaysRemaining(nextMilestone.date, today)} ${getMilestoneDaysRemaining(nextMilestone.date, today) === 1 ? 'day' : 'days'}`}`
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

        <section className="rounded-2xl border border-ink-200 bg-white/90 p-4 shadow-sm dark:border-ink-700 dark:bg-ink-900/90 sm:p-5" aria-labelledby="semester-timeline-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="semester-timeline-title" className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                Semester {semester?.number ?? '—'} timeline
              </h2>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                {semester ? `${formatDate(semester.start)} – ${formatDate(semester.end)}` : 'No semester dates are available.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-ink-600 dark:text-ink-300" aria-label="Timeline legend">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary-600" />Progress</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-warning-500" />Exams</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-error-500" />Today</span>
            </div>
          </div>

          {semester && (
            <div className="mt-5 overflow-x-auto pb-2" role="region" aria-label="Scrollable semester timeline">
              <div
                className="relative min-w-[760px]"
                role="img"
                aria-label={`Semester ${semester.number} is ${Math.round(semesterProgress)} percent complete. ${semesterEvents.length} calendar events are marked.`}
              >
                <div className="relative mt-8 h-3 rounded-full bg-ink-200 dark:bg-ink-700">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary-600" style={{ width: `${semesterProgress}%` }} />
                  {exam && (
                    <div
                      className="absolute inset-y-0 rounded-full bg-warning-400/90"
                      style={{
                        left: `${examStartPosition}%`,
                        width: `${Math.max(1, examEndPosition - examStartPosition)}%`,
                      }}
                    />
                  )}
                  <div className="absolute -top-7 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-error-700 dark:text-error-300" style={{ left: `${semesterProgress}%` }}>
                    Today
                  </div>
                  <div className="absolute -top-1.5 h-6 w-0.5 -translate-x-1/2 bg-error-500" style={{ left: `${semesterProgress}%` }} />
                  {semesterEvents.map((event) => {
                    const position = clampPercent(
                      (getDaysUntilCalendarDate(event.date, parseCalendarDate(semester.start)) / semesterDays) * 100,
                    );
                    return (
                      <span
                        key={event.id}
                        className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${eventMarkerColor(event.type)} dark:border-ink-900`}
                        style={{ left: `${position}%` }}
                        title={`${event.label}: ${formatDate(event.date)}`}
                        aria-hidden="true"
                      />
                    );
                  })}
                </div>
                <div className="relative mt-3 h-28">
                  {semesterEvents.map((event, index) => {
                    const position = clampPercent(
                      (getDaysUntilCalendarDate(event.date, parseCalendarDate(semester.start)) / semesterDays) * 100,
                    );
                    return (
                      <div
                        key={event.id}
                        className="absolute flex w-24 -translate-x-1/2 flex-col items-center text-center"
                        style={{ left: `${position}%`, top: `${(index % 3) * 34}px` }}
                        title={`${event.label}: ${formatDate(event.date)}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${eventMarkerColor(event.type)}`} aria-hidden="true" />
                        <span className="mt-1 line-clamp-2 text-[10px] leading-3 text-ink-600 dark:text-ink-300">
                          {event.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between border-t border-ink-200 pt-2 text-xs text-ink-500 dark:border-ink-700 dark:text-ink-300">
                  <span>Semester start</span>
                  <span>Semester end</span>
                </div>
              </div>
            </div>
          )}
        </section>

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
                ? 'Coursework assessment marks entered for this semester.'
                : 'Add coursework assessments to courses in this semester.'}
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
                  {formatDate(nextMilestone.date)} · {countdownLabel(getMilestoneDaysRemaining(nextMilestone.date, today))}
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
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">The next five dates in the academic calendar.</p>
              </div>
              <CalendarDays className="h-5 w-5 text-primary-700 dark:text-primary-300" aria-hidden="true" />
            </div>
            {upcomingMilestones.length ? (
              <ol className="mt-4 divide-y divide-ink-100 dark:divide-ink-700">
                {upcomingMilestones.map((milestone) => (
                  <li key={milestone.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${eventMarkerColor(milestone.type)}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{milestone.label}</p>
                      <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-300">
                        {formatDate(milestone.date)}{milestone.semesterNumber ? ` · Semester ${milestone.semesterNumber}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800 dark:bg-primary-900/50 dark:text-primary-200">
                      {countdownLabel(getMilestoneDaysRemaining(milestone.date, today))}
                    </span>
                  </li>
                ))}
              </ol>
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
