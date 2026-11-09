import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Bar,
  BarChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
import setupLinkIllustration from '@/assets/onboarding/setup-link.svg';
import aboutYouIllustration from '@/assets/onboarding/about-you.svg';
import courseUnitsIllustration from '@/assets/onboarding/course-units.svg';
import targetCgpaIllustration from '@/assets/onboarding/target-cgpa.svg';
import resultsIllustration from '@/assets/onboarding/results.svg';
import finishIllustration from '@/assets/onboarding/finish.svg';
import { ImportSetupPage } from '@/pages/ImportSetupPage';
import { useAppData } from '@/lib/useAppData';
import { useAuth } from '@/contexts/useAuth';
import { readOnboardingState, saveOnboardingState } from '@/lib/localSync';
import {
  createOnboardingDraft,
  parseCourseList,
  type OnboardingDraft,
  type OnboardingMetrics,
  type SetupReminderState,
} from '@/lib/onboarding';
import {
  GRADE_SCALE,
  minPercentForGradePoint,
  totalCredits,
  type Assessment,
  type CourseUnit,
  type Semester,
} from '@/lib/types';
import {
  customTargetPercentForSettings,
  gradePointForTargetChoice,
  targetChoiceForSettings,
  targetChoiceForGradePoint,
  TARGET_OPTIONS,
  type TargetChoice,
} from '@/lib/gradingConfig';
import { getGradePoint } from '@/lib/types';
import {
  academicTotals,
  courseContributions,
  courseWeights,
  honoursBracketFor,
  maximumGradePointForScale,
  MINIMUM_GRADUATION_CGPA,
  parseAcademicBaseline,
  requiredAverageForRemaining,
  scoreCoverage,
  semesterGpa,
  trajectoryWithBaseline,
  type SemesterBaseline,
} from '@/lib/onboardingStats';
import { AnimatedProgressRing } from '@/ui/effects/AnimatedProgressRing';
import { EnterList } from '@/ui/effects/EnterList';
import { StepTransition } from '@/ui/effects/StepTransition';
import { useReducedMotionPreference } from '@/ui/effects/useReducedMotionPreference';

const steps = ['Optional setup link', 'About you', 'Course units', 'Your target', 'Any results yet?', 'Finish'];
const stepDescriptions = [
  'Bring an existing CGP setup into this workspace, or start fresh.',
  'Choose your institution and add the programme and semester details you know.',
  'Add course units and credits now; you can fill in anything missing later.',
  'Choose the grade or percentage you are aiming for; you can change it later in Settings.',
  'Add real results if you have them. Your preview updates after a brief pause.',
  'Review the details you entered and open your academic dashboard.',
];
const stepIllustrations = [
  setupLinkIllustration,
  aboutYouIllustration,
  courseUnitsIllustration,
  targetCgpaIllustration,
  resultsIllustration,
  finishIllustration,
];
const universityGroups = [
  {
    label: 'Public Universities',
    options: [
      'Makerere University (MAK) - Kampala',
      'Kyambogo University (KYU) - Kampala',
      'Mbarara University of Science and Technology (MUST) - Mbarara',
      'Gulu University (GU) - Gulu',
      'Busitema University (BU) - Busitema / Tororo',
      'Kabale University (KAB) - Kabale',
      'Lira University (LU) - Lira',
      'Muni University (MU) - Arua',
      'Soroti University (SUN) - Soroti',
      'Mountains of the Moon University (MMU) - Fort Portal',
      'Makerere University Business School (MUBS) - Nakawa',
    ],
  },
  {
    label: 'Private Chartered Universities',
    options: [
      'Uganda Christian University (UCU) - Mukono',
      'Uganda Martyrs University (UMU) - Nkozi',
      'Islamic University in Uganda (IUIU) - Mbale / Kampala',
      'Ndejje University (NDU) - Luweero / Kampala',
      'Nkumba University (NKU) - Entebbe',
      'Bugema University (BMU) - Bugema / Kampala',
      'Kampala International University (KIU) - Kansanga, Kampala',
      'Bishop Stuart University (BSU) - Mbarara',
      'International University of East Africa (IUEA) - Kansanga, Kampala',
      'ISBAT University - Kampala',
      'Kampala University (KU) - Ggaba, Kampala',
      'African Bible University (ABU) - Lubowa',
      'Victoria University Uganda (VU) - Kampala',
    ],
  },
  {
    label: 'Provisionally Licensed Private Universities',
    options: [
      'Cavendish University Uganda (CUU) - Kampala',
      'Clarke International University (CIU) - Kampala',
      'Africa Renewal University (AfRU) - Buloba',
      'African Rural University (ARU) - Kagadi',
      'Aga Khan University (AKU) - Kampala',
      'All Saints University Lango (ASUL) - Lira',
      'Ankole Western University (AWU) - Kabwohe',
      'Great Lakes Regional University (GLRU) - Kanungu',
      'Kumi University (KUMU) - Kumi',
      'LivingStone International University (LIU) - Mbale',
      'Muteesa I Royal University (MRU) - Masaka / Kirumba',
      'King Ceasor University (KCU) - Bunga, Kampala',
      'Metropolitan International University (MIU) - Kisoro / Kampala',
      'St. Lawrence University (SLAU) - Mengo, Kampala',
      'Uganda Pentecostal University (UPU) - Fort Portal',
      'University of Kisubi (UNIK) - Kisubi',
      'University of the Sacred Heart Gulu (USHG) - Gulu',
      'UTAMU (Uganda Technology and Management University) - Kampala',
      'Ibanda University (IU) - Ibanda',
      'Nexus International University (NIU) - Kampala',
      'Islamic Call University College (ICUC) - Kampala',
    ],
  },
  {
    label: 'Specialized and Military Institutions',
    options: [
      'Uganda Management Institute (UMI) - Kampala',
      'National Defence College, Uganda (NDCU) - Njeru',
      'Uganda Military Engineering College (UMEC) - Lugazi',
      'Uganda Senior Command and Staff College (USCSC) - Kimaka, Jinja',
    ],
  },
];
const universities = universityGroups.flatMap((group) => group.options);

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

function isTargetChoice(value: unknown): value is TargetChoice {
  return TARGET_OPTIONS.some((option) => option.value === value);
}

function draftFromSettings(data: ReturnType<typeof useAppData>['data']) {
  const saved = data.settings.onboardingDraft;
  const savedCustomTarget = customTargetPercentForSettings(data.settings);
  if (isOnboardingDraft(saved) && !saved.completed) {
    const targetCGPA = saved.targetCGPA ?? data.settings.targetCGPA;
    const savedCustom = saved.customTargetPercent ?? savedCustomTarget;
    const targetChoice = isTargetChoice(saved.targetChoice)
      ? saved.targetChoice
      : savedCustom !== null
        ? 'custom'
        : saved.targetCGPA === null
          ? 'A'
          : targetChoiceForGradePoint(targetCGPA);
    return {
      ...saved,
      targetCGPA,
      targetChoice,
      customTargetPercent: savedCustom
        ?? (targetChoice === 'custom' && saved.targetCGPA !== null && saved.targetCGPA !== undefined
          ? minPercentForGradePoint(saved.targetCGPA)
          : null),
    };
  }
  const targetCGPA = data.settings.targetCGPA;
  return {
    ...createOnboardingDraft(),
    university: data.settings.onboardingCompleted ? data.settings.university ?? '' : '',
    programme: data.settings.programme ?? '',
    yearOfStudy: data.settings.yearOfStudy ?? null,
    currentSemester: data.settings.currentSemester ?? 1,
    academicYear: data.settings.academicYear ?? createOnboardingDraft().academicYear,
    targetCGPA,
    targetChoice: savedCustomTarget !== null ? 'custom' : targetChoiceForSettings(data.settings),
    customTargetPercent: savedCustomTarget
      ?? (targetChoiceForGradePoint(targetCGPA) === 'custom' ? 0 : null),
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
    targetGradePoint: maximumGradePointForScale(),
    semesterId: 'onboarding-preview',
    assessments,
    topics: [],
    documents: [],
    createdAt: 0,
  };
}

export function OnboardingPage() {
  const prefersReducedMotion = useReducedMotionPreference();
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
  const [targetInput, setTargetInput] = useState(() =>
    draft.customTargetPercent === null || draft.customTargetPercent === undefined
      ? ''
      : String(draft.customTargetPercent));
  const [baselineInputs, setBaselineInputs] = useState({
    cgpa: '',
    creditsEarned: '',
    semesters: [] as Array<{ id: string; label: string; gpa: string; credits: string }>,
  });
  const [committedBaseline, setCommittedBaseline] = useState<{
    cgpa: number | null;
    creditsEarned: number | null;
    semesters: SemesterBaseline[];
  }>({ cgpa: null, creditsEarned: null, semesters: [] });
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [cgpaMovement, setCgpaMovement] = useState<number | null>(null);
  const lastRecordedStep = useRef<number | null>(null);
  const previousCgpa = useRef<number | null>(null);
  const movementTimer = useRef<number | null>(null);
  const scorePreviewTimers = useRef(new Map<string, number>());
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const initialData = useRef(data);
  const restart = new URLSearchParams(location.search).get('again') === '1';

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const updatePreference = () => setSystemDark(preference.matches);
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    let active = true;
    if (!user?.id) return () => { active = false; };
    void readOnboardingState(user.id).then((saved) => {
      if (!active) return;
      const currentDraft = saved?.draft;
      const shouldRestart = restart && (!currentDraft || currentDraft.completed);
      let nextDraft: OnboardingDraft;
      if (shouldRestart) {
        nextDraft = draftFromSettings(initialData.current);
      } else if (isOnboardingDraft(currentDraft)) {
        nextDraft = currentDraft;
      } else {
        nextDraft = draftFromSettings(initialData.current);
      }
      setDraft(nextDraft);
      setTargetInput(nextDraft.customTargetPercent === null || nextDraft.customTargetPercent === undefined
        ? ''
        : String(nextDraft.customTargetPercent));
      setPreviewScores({ ...nextDraft.scores });
      setScoreInputs(scoresToInputs(nextDraft.scores));
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
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCommittedBaseline(parseAcademicBaseline(baselineInputs));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [baselineInputs]);

  const previewCourses = useMemo(() => draft.courses
    .filter((course) => course.name.trim())
    .map((course) => makePreviewCourse(course, previewScores[course.id] ?? null)), [draft.courses, previewScores]);
  const creditTotal = totalCredits(previewCourses);
  const matchingPreviewSemester = data.semesters.find((semester) =>
    semester.academicYear.trim().toLowerCase() === draft.academicYear.trim().toLowerCase()
    && semester.semesterNumber === draft.currentSemester);
  const previewSemesterId = matchingPreviewSemester?.id ?? 'onboarding-preview';
  const previewCoursesInSemester = previewCourses.map((course) => ({
    ...course,
    semesterId: previewSemesterId,
  }));
  const statsCourses = [
    ...data.courses.filter((course) => !previewCoursesInSemester.some((previewCourse) =>
      course.semesterId === previewCourse.semesterId
      && course.name.trim().toLocaleLowerCase() === previewCourse.name.trim().toLocaleLowerCase())),
    ...previewCoursesInSemester,
  ];
  const previewSemesters: Semester[] = matchingPreviewSemester || previewCourses.length === 0
    ? data.semesters
    : [...data.semesters, {
      id: previewSemesterId,
      academicYear: draft.academicYear,
      semesterNumber: draft.currentSemester,
      createdAt: draft.startedAt,
    }];
  const currentSemesterCourses = statsCourses.filter((course) => course.semesterId === previewSemesterId);
  const currentSemesterCoverage = scoreCoverage(currentSemesterCourses);
  const currentSemesterGpa = semesterGpa(currentSemesterCourses, previewSemesterId);
  const baseline = {
    cgpa: committedBaseline.cgpa,
    creditsEarned: committedBaseline.creditsEarned,
    semesters: committedBaseline.semesters,
  };
  const academicTotalsPreview = academicTotals(statsCourses, baseline);
  const baselineSummary = academicTotals([], baseline);
  const currentCgpa = academicTotalsPreview.cgpa;
  const maximumGradePoint = maximumGradePointForScale();
  const parsedTargetInput = Number(targetInput);
  const targetInputIsValid = targetInput.trim() !== ''
    && Number.isFinite(parsedTargetInput)
    && parsedTargetInput >= 0
    && parsedTargetInput <= 100;
  const previewTarget = draft.targetCGPA;
  const weights = courseWeights(previewCourses);
  const contributions = courseContributions(currentSemesterCourses);
  const allContributions = courseContributions(statsCourses);
  const qualityPoints = academicTotalsPreview.qualityPoints;
  const creditsDone = academicTotalsPreview.credits;
  const completedCourseIds = new Set(allContributions.map((contribution) => contribution.courseId));
  const remainingCredits = statsCourses.reduce((sum, course) =>
    completedCourseIds.has(course.id) ? sum : sum + course.creditUnits, 0);
  const requiredAverage = previewTarget === null
    ? null
    : requiredAverageForRemaining(previewTarget, creditsDone, qualityPoints, remainingCredits);
  const honoursBracket = previewTarget === null ? null : honoursBracketFor(previewTarget);
  const trajectory = trajectoryWithBaseline(previewSemesters, statsCourses, baseline);
  const chartTextColor = systemDark ? '#cbd5e1' : '#475569';
  const chartGridColor = systemDark ? '#475569' : '#cbd5e1';

  useEffect(() => {
    if (currentCgpa === null || metrics.timeToFirstCgpaMs !== null) return;
    setMetrics((current) => current.timeToFirstCgpaMs === null
      ? { ...current, timeToFirstCgpaMs: Math.max(0, Date.now() - draft.startedAt) }
      : current);
  }, [currentCgpa, draft.startedAt, metrics.timeToFirstCgpaMs]);

  useEffect(() => {
    const previous = previousCgpa.current;
    if (previous !== null && currentCgpa !== null) {
      const movement = Number((currentCgpa - previous).toFixed(2));
      if (movement !== 0) {
        setCgpaMovement(movement);
        if (movementTimer.current !== null) window.clearTimeout(movementTimer.current);
        movementTimer.current = window.setTimeout(() => setCgpaMovement(null), 2400);
      }
    } else {
      setCgpaMovement(null);
    }
    previousCgpa.current = currentCgpa;
    return () => {
      if (movementTimer.current !== null) window.clearTimeout(movementTimer.current);
    };
  }, [currentCgpa]);

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
      const targetChoice = draft.targetChoice ?? 'A';
      const targetCGPA = gradePointForTargetChoice(targetChoice, draft.customTargetPercent);
      if (targetCGPA === null) {
        setFinishError('Enter a valid custom target percentage before finishing setup.');
        return;
      }
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
          ?? addCourse(semesterId, courseDraft.name.trim(), '', courseDraft.creditUnits, targetCGPA);
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
        targetCGPA,
        targetSet: true,
        customTargetPercent: targetChoice === 'custom' ? draft.customTargetPercent ?? null : null,
        targetChoice,
        legacyTargetPromptDismissed: true,
        onboardingCompleted: true,
        onboardingDraft: completedDraft,
      });
      navigate('/dashboard');
    } catch (error) {
      console.error('Unable to finish CGP onboarding.', error);
      setFinishError('Your setup could not be completed. Your saved answers are still available; try again.');
    }
  };

  const skipSetup = () => finish();

  if (!storageReady) {
    return <main className="flex min-h-[50vh] items-center justify-center text-sm text-ink-500" role="status">Restoring your setup…</main>;
  }

  const isOtherUniversity = draft.university === 'Other';
  const setUniversity = (value: string) => {
    updateDraft({ university: value });
  };
  const handleStepKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type === 'button') return;
    event.preventDefault();
    moveTo(draft.currentStep + 1);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl flex-col bg-ink-50 text-ink-900 tabular-nums [&_.input::placeholder]:text-ink-500 dark:bg-ink-950 dark:text-ink-50 dark:[&_.text-ink-500]:!text-ink-300 dark:[&_.text-ink-600]:!text-ink-300 dark:[&_.text-ink-700]:!text-ink-200 dark:[&_.text-ink-900]:!text-ink-50 dark:[&_.bg-white]:!bg-ink-900 dark:[&_.bg-ink-50]:!bg-ink-800 dark:[&_.border-ink-100]:!border-ink-700 dark:[&_.border-ink-200]:!border-ink-700 dark:[&_.input]:!border-ink-600 dark:[&_.input]:!bg-ink-800 dark:[&_.input]:!text-ink-50 dark:[&_.input::placeholder]:!text-ink-300 dark:[&_.label]:!text-ink-200">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-200 bg-white px-3 py-3 dark:border-ink-700 dark:bg-ink-900 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/cgp-mark.svg" alt="" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">CGP setup</h1>
            <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-300">Progress saves as you go</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-full border border-ink-300 bg-white px-3 py-1.5 text-xs font-semibold tabular-nums text-ink-700 dark:border-ink-600 dark:bg-ink-800 dark:text-ink-100" aria-live="polite">
            Step {draft.currentStep + 1} of {steps.length}
          </span>
          <button type="button" className="text-sm font-semibold text-primary-700 underline-offset-2 hover:underline dark:text-primary-300" onClick={skipSetup}>
            Skip setup
          </button>
        </div>
      </header>

      <main className="flex w-full flex-1 flex-col items-center px-3 py-4 sm:px-5 sm:py-6 lg:justify-center">
      <div className="w-full max-w-5xl space-y-4 sm:space-y-5">
      <nav aria-label="Setup progress" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-900 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-ink-900 dark:text-ink-50">Setup progress</span>
          <span className="hidden tabular-nums text-ink-600 dark:text-ink-300 sm:inline">{Math.round(((draft.currentStep + 1) / steps.length) * 100)}% complete</span>
        </div>
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={draft.currentStep + 1}
          className="h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700"
        >
          <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${((draft.currentStep + 1) / steps.length) * 100}%` }} />
        </div>
        <ol aria-label="Setup steps" className="mt-3 hidden grid-cols-6 gap-2 text-center text-xs text-ink-600 dark:text-ink-300 lg:grid">
          {steps.map((step, index) => (
            <li key={step} aria-current={index === draft.currentStep ? 'step' : undefined} className={index === draft.currentStep ? 'font-semibold text-primary-700 dark:text-primary-300' : ''}>{step}</li>
          ))}
        </ol>
      </nav>

      {saveError && <p role="alert" className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-800 dark:border-error-700 dark:bg-error-900 dark:text-error-100">{saveError}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <section className="card min-w-0 p-4 shadow-sm dark:border-ink-700 dark:bg-ink-900 sm:p-6" aria-labelledby="onboarding-step-title" onKeyDown={handleStepKeyDown}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 ref={stepHeadingRef} id="onboarding-step-title" tabIndex={-1} className="font-display text-xl font-bold text-ink-900 dark:text-ink-50 sm:text-2xl">{steps[draft.currentStep]}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-600 dark:text-ink-300">{stepDescriptions[draft.currentStep]}</p>
            </div>
            <img src={stepIllustrations[draft.currentStep]} alt="" aria-hidden="true" className="h-14 w-16 shrink-0 object-contain sm:h-16 sm:w-20" />
          </div>
          <StepTransition step={draft.currentStep} className="mt-4 space-y-4">
            {draft.currentStep === 0 && (
              <>
                <p className="text-sm leading-6 text-ink-600">Paste a CGP setup link or code to review what it contains before importing. If you are starting fresh, continue to the next step.</p>
                <ImportSetupPage onImported={importedSetup} />
              </>
            )}

            {draft.currentStep === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="onboarding-university" className="label">University</label>
                  <select id="onboarding-university" className="input" value={universities.includes(draft.university) ? draft.university : draft.university ? 'Other' : ''} onChange={(event) => setUniversity(event.target.value)} aria-label="University">
                    <option value="">Choose a university (optional)</option>
                    {universityGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((university) => (
                          <option key={university} value={university}>{university}</option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="Other">Other</option>
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
                  <input id="onboarding-programme" className="input" maxLength={120} value={draft.programme} onChange={(event) => updateDraft({ programme: event.target.value })} />
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
                  <input id="onboarding-academic-year" className="input" maxLength={20} value={draft.academicYear} onChange={(event) => updateDraft({ academicYear: event.target.value })} />
                </div>
                <section className="sm:col-span-2 space-y-4 border-t border-ink-200 pt-4 dark:border-ink-700" aria-labelledby="past-results-title">
                  <div>
                    <h3 id="past-results-title" className="text-base font-semibold text-ink-900 dark:text-ink-50">Previous academic results (optional)</h3>
                    <p className="mt-1 text-sm leading-5 text-ink-600 dark:text-ink-300">Use these shortcuts for previous results that are not already entered as course units. Semester totals take priority over the overall shortcut.</p>
                    <p className="mt-1 text-xs leading-5 text-ink-600 dark:text-ink-300">Shortcut values are used for this setup summary only. Add course details and results to save them as academic records.</p>
                  </div>
                  <fieldset className="grid gap-3 rounded-xl border border-ink-200 p-3 dark:border-ink-700 sm:grid-cols-2">
                    <legend className="px-1 text-sm font-medium text-ink-800 dark:text-ink-100">I already know my CGPA and credits earned</legend>
                    <div>
                      <label htmlFor="baseline-cgpa" className="label">Current CGPA</label>
                      <input id="baseline-cgpa" className="input tabular-nums" type="number" min={0} max={maximumGradePoint} step={0.01} inputMode="decimal" value={baselineInputs.cgpa} onChange={(event) => setBaselineInputs((current) => ({ ...current, cgpa: event.target.value }))} aria-describedby="baseline-cgpa-help" />
                      <p id="baseline-cgpa-help" className="mt-1 text-xs text-ink-600 dark:text-ink-300">Use the same grade scale as CGP.</p>
                    </div>
                    <div>
                      <label htmlFor="baseline-credits" className="label">Credits earned</label>
                      <input id="baseline-credits" className="input tabular-nums" type="number" min={0} step={1} inputMode="decimal" value={baselineInputs.creditsEarned} onChange={(event) => setBaselineInputs((current) => ({ ...current, creditsEarned: event.target.value }))} />
                    </div>
                  </fieldset>
                  <fieldset className="space-y-3 rounded-xl border border-ink-200 p-3 dark:border-ink-700">
                    <legend className="px-1 text-sm font-medium text-ink-800 dark:text-ink-100">Per-semester totals</legend>
                    {baselineInputs.semesters.map((semester, index) => (
                      <div key={semester.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(5rem,.7fr)_minmax(5rem,.7fr)_auto]">
                        <div className="col-span-2 sm:col-span-1">
                          <label htmlFor={`baseline-semester-label-${semester.id}`} className="label">Semester label</label>
                          <input id={`baseline-semester-label-${semester.id}`} className="input" value={semester.label} onChange={(event) => setBaselineInputs((current) => ({
                            ...current,
                            semesters: current.semesters.map((item) => item.id === semester.id ? { ...item, label: event.target.value } : item),
                          }))} aria-label={`Label for past semester ${index + 1}`} />
                        </div>
                        <div>
                          <label htmlFor={`baseline-semester-gpa-${semester.id}`} className="label">GPA</label>
                          <input id={`baseline-semester-gpa-${semester.id}`} className="input tabular-nums" type="number" min={0} max={maximumGradePoint} step={0.01} inputMode="decimal" value={semester.gpa} onChange={(event) => setBaselineInputs((current) => ({
                            ...current,
                            semesters: current.semesters.map((item) => item.id === semester.id ? { ...item, gpa: event.target.value } : item),
                          }))} />
                        </div>
                        <div>
                          <label htmlFor={`baseline-semester-credits-${semester.id}`} className="label">Credits</label>
                          <input id={`baseline-semester-credits-${semester.id}`} className="input tabular-nums" type="number" min={0} step={1} inputMode="decimal" value={semester.credits} onChange={(event) => setBaselineInputs((current) => ({
                            ...current,
                            semesters: current.semesters.map((item) => item.id === semester.id ? { ...item, credits: event.target.value } : item),
                          }))} />
                        </div>
                        <button type="button" className="mb-0.5 inline-flex h-11 w-10 items-center justify-center rounded-lg text-ink-600 hover:bg-error-50 hover:text-error-700 dark:text-ink-300 dark:hover:bg-error-900" aria-label={`Remove past semester ${index + 1}`} onClick={() => setBaselineInputs((current) => ({
                          ...current,
                          semesters: current.semesters.filter((item) => item.id !== semester.id),
                        }))}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    <button type="button" className="btn-secondary" onClick={() => setBaselineInputs((current) => ({
                      ...current,
                      semesters: [...current.semesters, {
                        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
                        label: '',
                        gpa: '',
                        credits: '',
                      }],
                    }))}>Add semester total</button>
                    <p className="text-xs leading-5 text-ink-600 dark:text-ink-300">Enter GPA and credits for semesters not already represented by course results. Course detail can be added later.</p>
                  </fieldset>
                </section>
              </div>
            )}

            {draft.currentStep === 2 && (
              <div className="space-y-5">
                <p className="text-sm leading-6 text-ink-600 dark:text-ink-300">Add course units now or leave this list empty and add them later.</p>
                <div className="space-y-3">
                  {draft.courses.map((course, index) => (
                    <EnterList key={course.id} delay={0} className="w-full">
                      <div className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] items-end gap-2">
                        <div className="min-w-0">
                          <label htmlFor={`course-name-${course.id}`} className="label">Course unit {index + 1}</label>
                          <input id={`course-name-${course.id}`} className="input" maxLength={120} value={course.name} onChange={(event) => updateCourseRow(course.id, { name: event.target.value })} />
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
                    </EnterList>
                  ))}
                </div>
                <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={addCourseRow} disabled={draft.courses.length >= 100}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add course unit
                </button>
                <div className="border-t border-ink-100 pt-4">
                  <label htmlFor="onboarding-course-paste" className="label">Paste a course list</label>
                  <p className="mb-2 text-xs text-ink-600 dark:text-ink-300">Use comma-, semicolon-, or line-separated course names with optional credit units.</p>
                  <textarea id="onboarding-course-paste" className="input min-h-20" value={pasteCourses} onChange={(event) => setPasteCourses(event.target.value)} />
                  <button type="button" className="btn-secondary mt-2 inline-flex items-center gap-2" disabled={!pasteCourses.trim()} onClick={applyCourseList}>Add pasted course units</button>
                </div>
              </div>
            )}

            {draft.currentStep === 3 && (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-ink-600">Choose what you are aiming for. You can change this later in Settings.</p>
                <div className="max-w-xs">
                  <label htmlFor="onboarding-target-choice" className="label">What are you aiming for?</label>
                  <select
                    id="onboarding-target-choice"
                    className="input"
                    value={draft.targetChoice ?? 'A'}
                    onChange={(event) => {
                      const choice = event.target.value as TargetChoice;
                      if (choice === 'custom') {
                        setDraft((current) => ({
                          ...current,
                          targetChoice: choice,
                          targetCGPA: null,
                          customTargetPercent: null,
                        }));
                        setTargetInput('');
                        return;
                      }
                      const targetCGPA = gradePointForTargetChoice(choice);
                      setDraft((current) => ({
                        ...current,
                        targetChoice: choice,
                        targetCGPA,
                        customTargetPercent: null,
                      }));
                      setTargetInput('');
                    }}
                  >
                    {TARGET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {draft.targetChoice === 'custom' && (
                    <div className="mt-3">
                      <label htmlFor="onboarding-custom-target" className="label">Custom course target</label>
                      <div className="flex items-center gap-2">
                        <input
                          id="onboarding-custom-target"
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          className="input tabular-nums"
                          value={targetInput}
                          onChange={(event) => {
                            const value = event.target.value;
                            const parsed = Number(value);
                            const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
                            setTargetInput(value);
                            setDraft((current) => ({
                              ...current,
                              customTargetPercent: valid ? parsed : null,
                              targetCGPA: valid ? getGradePoint(parsed) : null,
                            }));
                          }}
                          aria-describedby="onboarding-custom-target-help"
                          aria-invalid={!targetInputIsValid}
                        />
                        <span className="text-sm text-ink-500">%</span>
                      </div>
                      {!targetInputIsValid && (
                        <p role="alert" className="mt-1 text-xs leading-5 text-error-700 dark:text-error-300">
                          Enter a target percentage from 0% to 100%.
                        </p>
                      )}
                      <p id="onboarding-custom-target-help" className="mt-1 text-xs text-ink-600 dark:text-ink-300">
                        Your exact percentage is retained; the global CGPA goal follows its grade-scale band.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {draft.currentStep === 4 && (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-ink-600">If you have results, enter the current percentage for each course unit. Leave fields blank if results are not available yet.</p>
                {previewCourses.length ? (
                  <div className="space-y-3">
                    {previewCourses.map((course) => {
                      const scoreValue = scoreInputs[course.id] ?? '';
                      const scoreIsInvalid = !parseScoreInput(scoreValue).valid;
                      return (
                        <EnterList key={course.id} delay={0} className="w-full">
                          <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 rounded-xl border border-ink-200 p-3">
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
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-600 dark:text-ink-300">%</span>
                              </div>
                              {scoreIsInvalid && <p id={`result-error-${course.id}`} className="mt-1 text-xs text-error-700">Enter a percentage from 0 to 100.</p>}
                            </div>
                          </div>
                        </EnterList>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-600">Add course units first, or continue and enter results later.</p>
                )}
              </div>
            )}

            {draft.currentStep === 5 && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-success-200 bg-success-50 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-700" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-success-900">Setup complete. Your workspace is ready.</h3>
                    <p className="mt-1 text-sm leading-6 text-success-800">
                      {previewCourses.length} course units, {creditTotal.toLocaleString()} entered credits
                      {currentCgpa !== null && <>; current CGPA is {currentCgpa.toFixed(2)}.</>}
                    </p>
                  </div>
                </div>
                <p className="text-sm leading-6 text-ink-600">You can add assessments, results, targets, and topics later. Your choices are saved to this account and sync when a connection is available.</p>
                {finishError && <p role="alert" className="rounded-lg bg-error-50 p-3 text-sm text-error-700">{finishError}</p>}
                <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={finish}>Finish setting up <ArrowRight className="h-4 w-4" /></button>
              </div>
            )}
          </StepTransition>

          {draft.currentStep < 5 && (
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-5 dark:border-ink-700">
              <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => moveTo(draft.currentStep - 1)} disabled={draft.currentStep === 0}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
              </button>
              <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => moveTo(draft.currentStep + 1)}>
                Next <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </section>

        <aside aria-label="Setup summary" className="order-last min-w-0 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-900 lg:sticky lg:top-6 lg:order-none">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <BookOpen className="h-4 w-4 text-primary-600" aria-hidden="true" /> Summary
          </div>
          <p className="mt-1 text-xs text-ink-500">Calculated from your saved records and this setup only.</p>
          <div className="mt-4 rounded-xl bg-primary-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Entered course credits</p>
            <p className="mt-1 font-display text-3xl font-bold text-primary-900">{creditTotal.toLocaleString()}</p>
            <p className="text-xs text-primary-700">{previewCourses.length} course unit{previewCourses.length === 1 ? '' : 's'}</p>
          </div>
          {draft.currentStep === 2 && (
            <section className="mt-4" aria-labelledby="preview-weights-title">
              <h3 id="preview-weights-title" className="text-sm font-semibold text-ink-900">Credit weights</h3>
              {weights.length === 0 ? (
                <p className="mt-2 rounded-lg bg-ink-50 p-3 text-xs text-ink-500">Add named course units to see how their entered credits are weighted.</p>
              ) : (
                <>
                  <ul className="mt-3 space-y-3">
                    {weights.map((weight) => (
                      <li key={weight.courseId}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate font-medium text-ink-700">{weight.courseName}</span>
                          <span className="shrink-0 text-ink-500">{weight.percent?.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`${weight.courseName}: ${weight.percent?.toFixed(1)} percent of entered credits`}>
                          <div className="h-full rounded-full bg-primary-500" style={{ width: `${weight.percent ?? 0}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="sr-only">
                    Course credit weights: {weights.map((weight) => `${weight.courseName}, ${weight.percent?.toFixed(1)} percent`).join('; ')}.
                  </p>
                </>
              )}
            </section>
          )}

          {draft.currentStep === 3 && (
            <section className="mt-4 rounded-xl border border-ink-100 p-4" aria-labelledby="preview-target-title">
              <h3 id="preview-target-title" className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Target className="h-4 w-4 text-primary-600" aria-hidden="true" /> Target and honours
              </h3>
              {previewTarget === null ? (
                <p className="mt-2 text-sm leading-5 text-ink-600 dark:text-ink-300">Enter a valid target to review it against the CGP grade scale.</p>
              ) : honoursBracket ? (
                <div className="mt-3 flex items-center gap-3">
                  <AnimatedProgressRing
                    value={(previewTarget / maximumGradePoint) * 100}
                    label="Target position on the configured honours scale"
                  />
                  <div className="min-w-0">
                    <p className="font-display text-2xl font-bold tabular-nums text-ink-900 dark:text-ink-50">
                      {previewTarget.toFixed(2)}
                    </p>
                    <p className="text-sm text-ink-600 dark:text-ink-300">{honoursBracket.label}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm leading-5 text-ink-600 dark:text-ink-300">
                  {previewTarget < MINIMUM_GRADUATION_CGPA
                    ? `No honours band applies below ${MINIMUM_GRADUATION_CGPA.toFixed(2)}. The supplied configuration lists this as the minimum CGPA for graduation.`
                    : 'No classification band is configured for this target.'}
                </p>
              )}
              <details className="mt-3 text-sm text-ink-700 dark:text-ink-200">
                <summary className="cursor-pointer font-semibold">How is this calculated?</summary>
                <p className="mt-2 leading-5">The target is compared with CGP’s configured grading scale. Classification labels appear only when an honours bracket is configured.</p>
                <ul className="mt-2 space-y-1">
                  {GRADE_SCALE.map((grade) => (
                    <li key={`${grade.gp}-${grade.label}`} className="tabular-nums">
                      {grade.label}: {grade.minPercent}% and above = {grade.gp.toFixed(2)} grade points
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}

          {(draft.currentStep === 1 || draft.currentStep === 5) && (
            <section className="mt-4" aria-labelledby="preview-trend-title">
              <h3 id="preview-trend-title" className="text-sm font-semibold text-ink-900">
                {draft.currentStep === 5 ? 'CGPA trend' : 'Semester history'}
              </h3>
              {trajectory.filter((point) => point.cumulativeCgpa !== null).length < 2 ? (
                <p className="mt-2 rounded-lg bg-ink-50 p-3 text-sm text-ink-600 dark:bg-ink-800 dark:text-ink-300">A trend appears after results are available for at least two semesters.</p>
              ) : (
                <>
                  <div role="img" aria-label="Cumulative CGPA by semester">
                    <ResponsiveContainer width="100%" height={draft.currentStep === 5 ? 105 : 190}>
                      <LineChart data={trajectory} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                        {draft.currentStep !== 5 && <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />}
                        {draft.currentStep !== 5 && <XAxis dataKey="label" tick={{ fontSize: 12, fill: chartTextColor }} />}
                        <YAxis hide={draft.currentStep === 5} domain={[0, maximumGradePoint]} tick={{ fontSize: 12, fill: chartTextColor }} />
                        <Tooltip formatter={(value, name) => [
                          typeof value === 'number' ? value.toFixed(2) : '—',
                          name === 'projectedCgpa' ? 'Projected CGPA' : 'Actual CGPA',
                        ]} />
                        {previewTarget !== null && <ReferenceLine y={previewTarget} stroke="#a21caf" />}
                        <Line type="monotone" dataKey="cumulativeCgpa" name="Actual" stroke="#2563eb" strokeWidth={2} dot={draft.currentStep === 5 ? false : { r: 3 }} connectNulls isAnimationActive={!prefersReducedMotion} />
                        {trajectory.some((point) => point.projectedCgpa !== null) && (
                          <Line type="monotone" dataKey="projectedCgpa" name="Projected" stroke="#2563eb" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={!prefersReducedMotion} />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="sr-only">
                    {trajectory.filter((point) => point.cumulativeCgpa !== null)
                      .map((point) => `${point.label}: actual cumulative CGPA ${point.cumulativeCgpa?.toFixed(2)}`)
                      .join('; ')}.
                  </p>
                  <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">Actual results use a solid line. Projections use a dashed line.</p>
                </>
              )}
            </section>
          )}

          {draft.currentStep === 1 && (
            <section className="mt-4 rounded-xl border border-ink-200 p-3 dark:border-ink-700" aria-labelledby="preview-baseline-title">
              <h3 id="preview-baseline-title" className="text-sm font-semibold text-ink-900 dark:text-ink-50">Previous results entered</h3>
              {baselineSummary.credits > 0 ? (
                <>
                  <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">
                    Weighted CGPA {baselineSummary.cgpa?.toFixed(2)} across {baselineSummary.credits.toLocaleString()} credits.
                  </p>
                  {committedBaseline.semesters.map((semester) => (
                    <p key={semester.id} className="mt-1 text-xs text-ink-600 dark:text-ink-300">
                      {semester.label || 'Semester total'}: GPA {semester.gpa.toFixed(2)}, {semester.credits.toLocaleString()} credits
                    </p>
                  ))}
                </>
              ) : (
                <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">No previous results entered.</p>
              )}
            </section>
          )}

          {draft.currentStep === 4 && (
            <section className="mt-4 space-y-3" aria-labelledby="preview-results-title">
              <h3 id="preview-results-title" className="text-sm font-semibold text-ink-900">Results overview</h3>
              <div className="rounded-xl border border-ink-100 p-3">
                <p className="text-xs font-medium text-ink-500">Current semester GPA</p>
                {currentSemesterGpa === null ? (
                  <p className="mt-1 text-sm text-ink-500">No valid scores yet.</p>
                ) : (
                  <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink-900">{currentSemesterGpa.toFixed(2)}</p>
                )}
                <p className="mt-1 text-xs text-ink-500">{currentSemesterCoverage.label}</p>
                <details className="mt-2 text-sm text-ink-700 dark:text-ink-200">
                  <summary className="cursor-pointer font-semibold">How is this calculated?</summary>
                  <p className="mt-2 leading-5">Semester GPA = the sum of each scored course’s grade points × credits, divided by credits for scored courses. Unscored courses are excluded.</p>
                  <ul className="mt-2 space-y-1">
                    {GRADE_SCALE.map((grade) => (
                      <li key={`${grade.gp}-${grade.label}`} className="tabular-nums">
                        {grade.label}: {grade.minPercent}% and above = {grade.gp.toFixed(2)} grade points
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
              {contributions.length < 2 ? (
                <p className="rounded-lg bg-ink-50 p-3 text-xs text-ink-500">
                  {contributions.length === 1
                    ? `${contributions[0].courseName}: ${contributions[0].qualityPoints?.toFixed(2)} quality points. Add a second scored course to display the comparison chart.`
                    : currentSemesterCoverage.status === 'empty'
                      ? 'Enter valid course results to see quality-point contributions.'
                      : 'No valid course results are available for this semester.'}
                </p>
              ) : (
                <>
                  <div role="img" aria-label="Quality-point contribution by course">
                    <ResponsiveContainer width="100%" height={Math.max(120, Math.min(260, contributions.length * 38))}>
                      <BarChart data={contributions} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="courseName" width={90} tick={{ fontSize: 12, fill: chartTextColor }} />
                        <Tooltip formatter={(value) => [typeof value === 'number' ? value.toFixed(2) : '—', 'Quality points']} />
                        <Bar dataKey="qualityPoints" fill="#2563eb" radius={[0, 4, 4, 0]} isAnimationActive={!prefersReducedMotion} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="sr-only">
                    Course quality-point contributions: {contributions.map((contribution) => `${contribution.courseName}, ${contribution.qualityPoints?.toFixed(2)}`).join('; ')}.
                  </p>
                </>
              )}
            </section>
          )}

          {draft.currentStep === 5 && (
            <section className="mt-4 space-y-3" aria-labelledby="preview-finish-title">
              <h3 id="preview-finish-title" className="text-sm font-semibold text-ink-900">Setup summary</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-ink-50 p-3">
                <p className="text-xs text-ink-600">{committedBaseline.creditsEarned !== null || committedBaseline.semesters.length > 0 ? 'Summary CGPA with baseline' : 'Current CGPA'}</p>
                  <p className="mt-1 font-display text-lg font-bold text-ink-900">
                    {currentCgpa === null ? '—' : currentCgpa.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-ink-50 p-3">
                  <p className="text-xs text-ink-500">Target CGPA</p>
                  <p className="mt-1 font-display text-lg font-bold text-ink-900">
                    {previewTarget === null ? 'Not set' : previewTarget.toFixed(2)}
                  </p>
                </div>
              </div>
              {cgpaMovement !== null && (
                <p aria-live="polite" className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${cgpaMovement > 0 ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}>
                  {cgpaMovement > 0 ? '+' : ''}{cgpaMovement.toFixed(2)} CGPA change
                </p>
              )}
              {previewTarget !== null && (
                <p className="rounded-lg border border-ink-100 p-3 text-xs text-ink-600">
                  {currentCgpa === null
                    ? 'Enter valid results to calculate the target gap.'
                    : `Target gap: ${Math.abs(previewTarget - currentCgpa).toFixed(2)} ${currentCgpa >= previewTarget ? 'above target' : 'to target'}.`}
                </p>
              )}
              {previewTarget !== null && requiredAverage && (
                <div className="rounded-lg border border-ink-100 p-3">
                  <p className="text-xs font-medium text-ink-500">Average needed across remaining listed credits</p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">
                    {requiredAverage.status === 'reachable'
                      ? `${requiredAverage.average?.toFixed(2)} grade points`
                      : requiredAverage.status === 'already secured'
                        ? 'Already secured by entered results'
                        : 'Not reachable using only the listed remaining credits'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-600 dark:text-ink-300">This uses only entered remaining credits. CGP does not have a total programme-credit value.</p>
                  <details className="mt-2 text-sm text-ink-700 dark:text-ink-200">
                    <summary className="cursor-pointer font-semibold">How is this calculated?</summary>
                    <p className="mt-2 leading-5">Required average = (target × (credits earned + listed remaining credits) − quality points earned) ÷ listed remaining credits. Quality points are grade points × credits.</p>
                    <ul className="mt-2 space-y-1">
                      {GRADE_SCALE.map((grade) => (
                        <li key={`${grade.gp}-${grade.label}`} className="tabular-nums">
                          {grade.label}: {grade.minPercent}% and above = {grade.gp.toFixed(2)} grade points
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
              {previewTarget !== null && !requiredAverage && (
                <p className="rounded-lg bg-ink-50 p-3 text-xs text-ink-500">Required average is unavailable until valid course-credit data is entered.</p>
              )}
            </section>
          )}

          {(draft.currentStep === 0 || draft.currentStep === 1) && (
            <section className="mt-4 rounded-xl border border-ink-100 p-3">
              <p className="text-xs font-medium text-ink-500">Current CGPA from scored courses</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink-900">
                {currentCgpa === null ? '—' : currentCgpa.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-ink-500">{scoreCoverage(statsCourses).label}</p>
            </section>
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
      </main>
    </div>
  );
}
