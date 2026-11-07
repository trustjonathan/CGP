import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Plus,
  Trash2,
  Target,
} from 'lucide-react';
import { ImportSetupPage } from '@/pages/ImportSetupPage';
import { useAppData } from '@/lib/useAppData';
import { useAuth } from '@/contexts/useAuth';
import { readOnboardingState, saveOnboardingState } from '@/lib/localSync';
import { runWhatIf } from '@/lib/forecast';
import {
  createOnboardingDraft,
  parseCourseList,
  type OnboardingDraft,
  type OnboardingMetrics,
  type SetupReminderState,
} from '@/lib/onboarding';
import {
  cgpa,
  totalCredits,
  type Assessment,
  type CourseUnit,
} from '@/lib/types';

const steps = ['Optional setup link', 'About you', 'Course units', 'Target CGPA', 'Any results yet?', 'Finish'];
const universities = [
  'Kabale University',
  'Makerere University',
  'Kyambogo University',
  'Mbarara University of Science and Technology',
  'Uganda Christian University',
  'Other',
];

const emptyMetrics: OnboardingMetrics = {
  stepReached: {},
  stepSkipped: {},
  completed: 0,
  timeToFirstCgpaMs: null,
};

const emptyReminder: SetupReminderState = {
  lastShownAt: null,
  snoozedUntil: null,
  dismissals: 0,
  notificationsEnabled: false,
};

function isOnboardingDraft(value: unknown): value is OnboardingDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<OnboardingDraft>;
  return Number.isInteger(draft.currentStep)
    && Number(draft.currentStep) >= 0
    && Number(draft.currentStep) < steps.length
    && typeof draft.startedAt === 'number'
    && Array.isArray(draft.courses)
    && typeof draft.scores === 'object'
    && draft.scores !== null;
}

function draftFromSettings(data: ReturnType<typeof useAppData>['data']) {
  const saved = data.settings.onboardingDraft;
  if (isOnboardingDraft(saved) && !saved.completed) return saved;
  return {
    ...createOnboardingDraft(),
    university: data.settings.onboardingCompleted ? data.settings.university ?? '' : '',
    programme: data.settings.programme ?? '',
    yearOfStudy: data.settings.yearOfStudy ?? null,
    currentSemester: data.settings.currentSemester ?? 1,
    academicYear: data.settings.academicYear ?? createOnboardingDraft().academicYear,
    targetCGPA: data.settings.targetSet === false || (!data.settings.onboardingCompleted && data.semesters.length === 0)
      ? null
      : data.settings.targetCGPA,
  };
}

function parseScoreInput(value: string) {
  if (!value.trim()) return { valid: true, score: null };
  const score = Number(value);
  const valid = Number.isFinite(score) && score >= 0 && score <= 100;
  return { valid, score: valid ? score : null };
}

function scoresToInputs(scores: Record<string, number | null>) {
  return Object.fromEntries(
    Object.entries(scores).map(([courseId, score]) => [courseId, score === null ? '' : String(score)]),
  );
}

function validMetrics(value: unknown): OnboardingMetrics {
  if (!value || typeof value !== 'object') return emptyMetrics;
  const metrics = value as Partial<OnboardingMetrics>;
  return {
    stepReached: metrics.stepReached && typeof metrics.stepReached === 'object' ? metrics.stepReached : {},
    stepSkipped: metrics.stepSkipped && typeof metrics.stepSkipped === 'object' ? metrics.stepSkipped : {},
    completed: typeof metrics.completed === 'number' ? metrics.completed : 0,
    timeToFirstCgpaMs: typeof metrics.timeToFirstCgpaMs === 'number' ? metrics.timeToFirstCgpaMs : null,
  };
}

function validReminder(value: unknown): SetupReminderState {
  if (!value || typeof value !== 'object') return emptyReminder;
  const reminder = value as Partial<SetupReminderState>;
  return {
    lastShownAt: typeof reminder.lastShownAt === 'number' ? reminder.lastShownAt : null,
    snoozedUntil: typeof reminder.snoozedUntil === 'number' ? reminder.snoozedUntil : null,
    dismissals: typeof reminder.dismissals === 'number' ? reminder.dismissals : 0,
    notificationsEnabled: reminder.notificationsEnabled === true,
  };
}

function makePreviewCourse(course: OnboardingDraft['courses'][number], score: number | null): CourseUnit {
  const assessments: Assessment[] = score === null ? [] : [{
    id: `${course.id}-result`,
    name: 'Current result',
    weight: 100,
    obtained: score,
    total: 100,
  }];
  return {
    id: course.id,
    name: course.name.trim(),
    code: '',
    creditUnits: course.creditUnits,
    targetGradePoint: 5,
    semesterId: 'onboarding-preview',
    assessments,
    topics: [],
    documents: [],
    createdAt: 0,
  };
}

export function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    data,
    addSemester,
    addCourse,
    addAssessment,
    updateAssessment,
    updateCourse,
    updateSettings,
  } = useAppData();
  const [draft, setDraft] = useState<OnboardingDraft>(() => draftFromSettings(data));
  const [previewScores, setPreviewScores] = useState<Record<string, number | null>>(() => ({ ...draft.scores }));
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>(() => scoresToInputs(draft.scores));
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [reminder, setReminder] = useState(emptyReminder);
  const [storageReady, setStorageReady] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pasteCourses, setPasteCourses] = useState('');
  const [finishError, setFinishError] = useState('');
  const lastRecordedStep = useRef<number | null>(null);
  const scorePreviewTimers = useRef(new Map<string, number>());
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const initialData = useRef(data);
  const restart = new URLSearchParams(location.search).get('again') === '1';

  useEffect(() => {
    let active = true;
    if (!user?.id) return () => { active = false; };
    void readOnboardingState(user.id).then((saved) => {
      if (!active) return;
      const currentDraft = saved?.draft;
      const shouldRestart = restart && (!currentDraft || currentDraft.completed);
      if (shouldRestart) {
        setDraft(draftFromSettings(initialData.current));
      } else if (isOnboardingDraft(currentDraft)) {
        setDraft(currentDraft);
      } else {
        setDraft(draftFromSettings(initialData.current));
      }
      setMetrics(validMetrics(saved?.metrics));
      setReminder(validReminder(saved?.reminder));
      setStorageReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      console.error('Unable to load the saved CGP onboarding draft.', error);
      setSaveError('The saved setup could not be loaded from this device. You can continue, but keep this page open until your answers are saved.');
      setStorageReady(true);
    });
    return () => { active = false; };
  }, [restart, user?.id]);

  useEffect(() => {
    if (!storageReady) return;
    setPreviewScores({ ...draft.scores });
    setScoreInputs(scoresToInputs(draft.scores));
  }, [draft.startedAt, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [draft.currentStep, storageReady]);

  useEffect(() => () => {
    for (const timer of scorePreviewTimers.current.values()) {
      window.clearTimeout(timer);
    }
    scorePreviewTimers.current.clear();
  }, []);

  useEffect(() => {
    if (!storageReady || !user?.id) return;
    const timer = window.setTimeout(() => {
      const state = { draft, metrics, reminder };
      void saveOnboardingState(user.id, state)
        .then(() => setSaveError(''))
        .catch((error: unknown) => {
          console.error('Unable to save the CGP onboarding draft.', error);
          setSaveError('Your setup could not be saved on this device. Check available storage and try again.');
        });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [draft, metrics, reminder, storageReady, user?.id]);

  useEffect(() => {
    if (!storageReady) return;
    const timer = window.setTimeout(() => updateSettings({ onboardingDraft: draft }), 800);
    return () => window.clearTimeout(timer);
  }, [draft, storageReady, updateSettings]);

  useEffect(() => {
    if (!storageReady || lastRecordedStep.current === draft.currentStep) return;
    lastRecordedStep.current = draft.currentStep;
    setMetrics((current) => ({
      ...current,
      stepReached: {
        ...current.stepReached,
        [draft.currentStep]: (current.stepReached[String(draft.currentStep)] ?? 0) + 1,
      },
    }));
  }, [draft.currentStep, storageReady]);

  const previewCourses = useMemo(() => draft.courses
    .filter((course) => course.name.trim())
    .map((course) => makePreviewCourse(course, previewScores[course.id] ?? null)), [draft.courses, previewScores]);
  const creditTotal = totalCredits(previewCourses);
  const currentCgpa = cgpa(previewCourses);
  const hasTargetOrResults = draft.targetCGPA !== null
    || Object.values(previewScores).some((score) => score !== null);
  const projection = hasTargetOrResults && previewCourses.length ? runWhatIf(previewCourses, {}) : null;

  useEffect(() => {
    if (currentCgpa === null || metrics.timeToFirstCgpaMs !== null) return;
    setMetrics((current) => current.timeToFirstCgpaMs === null
      ? { ...current, timeToFirstCgpaMs: Math.max(0, Date.now() - draft.startedAt) }
      : current);
  }, [currentCgpa, draft.startedAt, metrics.timeToFirstCgpaMs]);

  const updateDraft = (updates: Partial<OnboardingDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
  };

  const updateScore = (courseId: string, value: string) => {
    const parsed = parseScoreInput(value);
    setScoreInputs((current) => ({ ...current, [courseId]: value }));
    setDraft((current) => ({
      ...current,
      scores: { ...current.scores, [courseId]: parsed.valid ? parsed.score : null },
    }));

    const existingTimer = scorePreviewTimers.current.get(courseId);
    if (existingTimer !== undefined) window.clearTimeout(existingTimer);
    const timer = window.setTimeout(() => {
      setPreviewScores((current) => ({
        ...current,
        [courseId]: parsed.valid ? parsed.score : null,
      }));
      scorePreviewTimers.current.delete(courseId);
    }, 300);
    scorePreviewTimers.current.set(courseId, timer);
  };

  const moveTo = (step: number, skipped = false) => {
    if (skipped) {
      setMetrics((current) => ({
        ...current,
        stepSkipped: {
          ...current.stepSkipped,
          [draft.currentStep]: (current.stepSkipped[String(draft.currentStep)] ?? 0) + 1,
        },
      }));
    }
    updateDraft({ currentStep: Math.max(0, Math.min(steps.length - 1, step)) });
  };

  const addCourseRow = () => {
    if (draft.courses.length >= 100) return;
    updateDraft({
      courses: [...draft.courses, {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        name: '',
        creditUnits: 3,
      }],
    });
  };

  const updateCourseRow = (id: string, updates: Partial<OnboardingDraft['courses'][number]>) => {
    updateDraft({ courses: draft.courses.map((course) => course.id === id ? { ...course, ...updates } : course) });
  };

  const applyCourseList = () => {
    const parsed = parseCourseList(pasteCourses);
    if (!parsed.length) return;
    updateDraft({ courses: [...draft.courses, ...parsed].slice(0, 100) });
    setPasteCourses('');
  };

  const importedSetup = () => {
    setMetrics((current) => ({
      ...current,
      stepSkipped: {
        ...current.stepSkipped,
        1: (current.stepSkipped['1'] ?? 0) + 1,
        2: (current.stepSkipped['2'] ?? 0) + 1,
      },
    }));
    moveTo(3);
  };

  const finish = () => {
    setFinishError('');
    try {
      const university = draft.university === 'Other' ? draft.otherUniversity.trim() : draft.university.trim();
      const academicYear = draft.academicYear.trim();
      const validCourses = draft.courses.filter((course) => course.name.trim());
      const matchingSemester = data.semesters.find((semester) =>
        semester.academicYear.trim().toLowerCase() === academicYear.toLowerCase()
        && semester.semesterNumber === draft.currentSemester);
      const semesterId = matchingSemester?.id
        ?? (academicYear && validCourses.length ? addSemester(academicYear, draft.currentSemester) : '');

      for (const courseDraft of validCourses) {
        if (!semesterId) break;
        const existing = data.courses.find((course) =>
          course.semesterId === semesterId
          && course.name.trim().toLocaleLowerCase() === courseDraft.name.trim().toLocaleLowerCase());
        const courseId = existing?.id
          ?? addCourse(semesterId, courseDraft.name.trim(), '', courseDraft.creditUnits, 5);
        if (existing) updateCourse(existing.id, { creditUnits: courseDraft.creditUnits });
        const score = draft.scores[courseDraft.id];
        if (score !== null && score !== undefined && (!existing || existing.assessments.length === 0)) {
          const assessmentId = addAssessment(courseId, 'Current result', 100, 100);
          updateAssessment(courseId, assessmentId, { obtained: score });
        }
      }

      const completedDraft = { ...draft, currentStep: 5, completed: true };
      setDraft(completedDraft);
      setMetrics((current) => ({ ...current, completed: current.completed + 1 }));
      updateSettings({
        university: university || data.settings.university,
        programme: draft.programme.trim() || data.settings.programme,
        yearOfStudy: draft.yearOfStudy ?? data.settings.yearOfStudy,
        currentSemester: draft.currentSemester,
        academicYear: academicYear || data.settings.academicYear,
        targetCGPA: draft.targetCGPA ?? data.settings.targetCGPA,
        targetSet: draft.targetCGPA !== null ? true : (data.settings.targetSet ?? false),
        onboardingCompleted: true,
        onboardingDraft: completedDraft,
      });
      navigate('/dashboard');
    } catch (error) {
      console.error('Unable to finish CGP onboarding.', error);
      setFinishError('Your setup could not be completed. Your saved answers are still available; try again.');
    }
  };

  if (!storageReady) {
    return <main className="flex min-h-[50vh] items-center justify-center text-sm text-ink-500" role="status">Restoring your setup…</main>;
  }

  const isOtherUniversity = draft.university === 'Other';
  const setUniversity = (value: string) => {
    updateDraft({ university: value });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-5 text-white shadow-lg sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-100">Welcome to CGP</p>
        <h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">Set up your academic workspace</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-100">Add as much or as little as you like. Your progress is saved as you go.</p>
      </header>

      <nav aria-label="Setup progress" className="card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-ink-800">Step {draft.currentStep + 1} of {steps.length}</span>
          <span className="hidden text-ink-500 sm:inline">{steps[draft.currentStep]}</span>
        </div>
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={draft.currentStep + 1}
          className="h-2 overflow-hidden rounded-full bg-ink-100"
        >
          <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${((draft.currentStep + 1) / steps.length) * 100}%` }} />
        </div>
        <ol aria-label="Step indicators" className="mt-4 flex justify-center gap-2 sm:hidden">
          {steps.map((step, index) => (
            <li key={step} aria-current={index === draft.currentStep ? 'step' : undefined}>
              <span className={`block rounded-full ${index === draft.currentStep ? 'h-2.5 w-5 bg-primary-600' : 'h-2.5 w-2.5 bg-ink-200'}`} />
              <span className="sr-only">{step}</span>
            </li>
          ))}
        </ol>
        <ol className="mt-3 hidden grid-cols-6 gap-2 text-center text-xs text-ink-500 sm:grid">
          {steps.map((step, index) => (
            <li key={step} className={index === draft.currentStep ? 'font-semibold text-primary-700' : ''}>{step}</li>
          ))}
        </ol>
      </nav>

      {saveError && <p role="alert" className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{saveError}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <section className="card min-w-0 p-4 sm:p-6" aria-labelledby="onboarding-step-title">
          <h2 ref={stepHeadingRef} id="onboarding-step-title" tabIndex={-1} className="font-display text-xl font-bold text-ink-900">{steps[draft.currentStep]}</h2>
          <div className="mt-5 space-y-5">
            {draft.currentStep === 0 && (
              <>
                <p className="text-sm leading-6 text-ink-600">Have a CGP setup link or code? Preview it and choose what to import. You can skip this if you are starting fresh.</p>
                <ImportSetupPage onImported={importedSetup} />
              </>
            )}

            {draft.currentStep === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="onboarding-university" className="label">University</label>
                  <select id="onboarding-university" className="input" value={universities.includes(draft.university) ? draft.university : draft.university ? 'Other' : ''} onChange={(event) => setUniversity(event.target.value)} aria-label="University">
                    <option value="">Choose a university (optional)</option>
                    {universities.map((university) => <option key={university} value={university}>{university}</option>)}
                  </select>
                </div>
                {isOtherUniversity && (
                  <div className="sm:col-span-2">
                    <label htmlFor="onboarding-other-university" className="label">University name</label>
                    <input id="onboarding-other-university" className="input" maxLength={120} value={draft.otherUniversity} onChange={(event) => updateDraft({ otherUniversity: event.target.value })} placeholder="Enter your university" />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label htmlFor="onboarding-programme" className="label">Programme</label>
                  <input id="onboarding-programme" className="input" maxLength={120} value={draft.programme} onChange={(event) => updateDraft({ programme: event.target.value })} placeholder="e.g. Bachelor of Agriculture" />
                </div>
                <div>
                  <label htmlFor="onboarding-year" className="label">Year of study</label>
                  <select id="onboarding-year" className="input" value={draft.yearOfStudy ?? ''} onChange={(event) => updateDraft({ yearOfStudy: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">Choose year</option>
                    {[1, 2, 3, 4, 5, 6].map((year) => <option key={year} value={year}>Year {year}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="onboarding-semester" className="label">Semester</label>
                  <select id="onboarding-semester" className="input" value={draft.currentSemester} onChange={(event) => updateDraft({ currentSemester: Number(event.target.value) })}>
                    <option value={1}>Semester 1</option>
                    <option value={2}>Semester 2</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="onboarding-academic-year" className="label">Academic year</label>
                  <input id="onboarding-academic-year" className="input" maxLength={20} value={draft.academicYear} onChange={(event) => updateDraft({ academicYear: event.target.value })} placeholder="e.g. 2026/2027" />
                </div>
              </div>
            )}

            {draft.currentStep === 2 && (
              <div className="space-y-5">
                <p className="text-sm leading-6 text-ink-600">Add your course units. Missing names are highlighted but will not stop you from continuing.</p>
                <div className="space-y-3">
                  {draft.courses.map((course, index) => (
                    <div key={course.id} className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] items-end gap-2">
                      <div className="min-w-0">
                        <label htmlFor={`course-name-${course.id}`} className="label">Course unit {index + 1}</label>
                        <input id={`course-name-${course.id}`} className="input" maxLength={120} value={course.name} onChange={(event) => updateCourseRow(course.id, { name: event.target.value })} placeholder="e.g. Soil Science" />
                        {!course.name.trim() && <p className="mt-1 text-xs text-warning-700">Add a course name or leave this row blank.</p>}
                      </div>
                      <div>
                        <label htmlFor={`course-cu-${course.id}`} className="label">Credits</label>
                        <select id={`course-cu-${course.id}`} className="input" value={course.creditUnits} onChange={(event) => updateCourseRow(course.id, { creditUnits: Number(event.target.value) })}>
                          {[1, 2, 3, 4, 5, 6].map((credits) => <option key={credits} value={credits}>{credits} CU</option>)}
                        </select>
                      </div>
                      <button type="button" className="mb-0.5 inline-flex h-11 w-10 items-center justify-center rounded-lg text-ink-500 hover:bg-error-50 hover:text-error-700" aria-label={`Remove course unit ${index + 1}`} onClick={() => updateDraft({ courses: draft.courses.filter((item) => item.id !== course.id) })}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={addCourseRow} disabled={draft.courses.length >= 100}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add course unit
                </button>
                <div className="border-t border-ink-100 pt-4">
                  <label htmlFor="onboarding-course-paste" className="label">Paste a course list</label>
                  <p className="mb-2 text-xs text-ink-500">Example: Soil Science 3, Botany 3</p>
                  <textarea id="onboarding-course-paste" className="input min-h-20" value={pasteCourses} onChange={(event) => setPasteCourses(event.target.value)} placeholder="Soil Science 3, Botany 3" />
                  <button type="button" className="btn-secondary mt-2 inline-flex items-center gap-2" disabled={!pasteCourses.trim()} onClick={applyCourseList}>Add pasted course units</button>
                </div>
              </div>
            )}

            {draft.currentStep === 3 && (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-ink-600">A target is optional. You can change it later in your CGP settings.</p>
                <div className="max-w-xs">
                  <label htmlFor="onboarding-target-cgpa" className="label">Target CGPA (out of 5)</label>
                  <input
                    id="onboarding-target-cgpa"
                    type="number"
                    min={0}
                    max={5}
                    step={0.01}
                    className="input"
                    value={draft.targetCGPA ?? ''}
                    onChange={(event) => updateDraft({
                      targetCGPA: event.target.value === ''
                        ? null
                        : Math.min(5, Math.max(0, Number(event.target.value))),
                    })}
                    placeholder="Optional"
                  />
                  <p className="mt-1 text-xs text-ink-500">Leave blank to set a target later.</p>
                </div>
              </div>
            )}

            {draft.currentStep === 4 && (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-ink-600">If you have results, enter your current percentage for each course unit. Leave blank or skip if you do not have results yet.</p>
                {previewCourses.length ? (
                  <div className="space-y-3">
                    {previewCourses.map((course) => {
                      const scoreValue = scoreInputs[course.id] ?? '';
                      const scoreIsInvalid = !parseScoreInput(scoreValue).valid;
                      return (
                        <div key={course.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 rounded-xl border border-ink-200 p-3">
                          <label htmlFor={`result-${course.id}`} className="min-w-0 break-words text-sm font-medium text-ink-900">{course.name}</label>
                          <div>
                            <div className="relative">
                              <input
                                id={`result-${course.id}`}
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                className="input pr-8"
                                value={scoreValue}
                                onChange={(event) => updateScore(course.id, event.target.value)}
                                placeholder="Optional"
                                aria-invalid={scoreIsInvalid}
                                aria-describedby={scoreIsInvalid ? `result-error-${course.id}` : undefined}
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">%</span>
                            </div>
                            {scoreIsInvalid && <p id={`result-error-${course.id}`} className="mt-1 text-xs text-error-700">Enter a percentage from 0 to 100.</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-600">Add course units first, or skip this step and enter results later.</p>
                )}
              </div>
            )}

            {draft.currentStep === 5 && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-success-200 bg-success-50 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-700" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-success-900">Your setup is ready</h3>
                    <p className="mt-1 text-sm leading-6 text-success-800">{previewCourses.length} course unit(s), {creditTotal} total credits{currentCgpa !== null ? `, current CGPA ${currentCgpa.toFixed(2)}` : ''}.</p>
                  </div>
                </div>
                <p className="text-sm leading-6 text-ink-600">You can add assessments, results, targets, and topics later. Your choices are saved to this account and will sync when a connection is available.</p>
                {finishError && <p role="alert" className="rounded-lg bg-error-50 p-3 text-sm text-error-700">{finishError}</p>}
                <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={finish}>Finish setting up <ArrowRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>

          {draft.currentStep < 5 && (
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-5">
              <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => moveTo(draft.currentStep - 1)} disabled={draft.currentStep === 0}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-50" onClick={() => moveTo(draft.currentStep + 1, true)}>Skip</button>
                <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => moveTo(draft.currentStep + 1)}>
                  Next <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </section>

        <aside aria-label="Live academic preview" className="order-last rounded-2xl border border-primary-100 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:order-none">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <BookOpen className="h-4 w-4 text-primary-600" aria-hidden="true" /> Live preview
          </div>
          <p className="mt-1 text-xs text-ink-500">Updates as you add course units and results.</p>
          <div className="mt-4 rounded-xl bg-primary-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Total credits</p>
            <p className="mt-1 font-display text-3xl font-bold text-primary-900">{creditTotal}</p>
            <p className="text-xs text-primary-700">{previewCourses.length} course unit{previewCourses.length === 1 ? '' : 's'}</p>
          </div>
          {projection && (
            <div className="mt-3 rounded-xl border border-ink-200 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500"><Target className="h-3.5 w-3.5" /> Projected CGPA</div>
              <p className="mt-1 font-display text-2xl font-bold text-ink-900">{projection.projectedCGPA.toFixed(2)}</p>
              <p className="mt-1 text-xs leading-5 text-ink-500">Illustrative projection using CGP’s current what-if assumptions.</p>
              {projection.projectedSemesterGPAs.map((semester, index) => (
                <p key={`${semester.semesterId}-${index}`} className="mt-2 text-xs text-ink-600">Projected semester trend: {semester.gpa.toFixed(2)}</p>
              ))}
            </div>
          )}
          {saveError ? (
            <p role="status" className="mt-3 text-xs text-error-700">{saveError}</p>
          ) : (
            <p role="status" className="mt-3 text-xs text-ink-500">Saved on this device. Account changes sync automatically when online.</p>
          )}
          {draft.completed && <Link to="/dashboard" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-700">Go to dashboard <ChevronDown className="h-4 w-4 rotate-[-90deg]" /></Link>}
        </aside>
      </div>
    </div>
  );
}
