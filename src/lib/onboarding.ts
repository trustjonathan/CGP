import type { AppData } from './types';

export interface OnboardingCourseDraft {
  id: string;
  name: string;
  creditUnits: number;
}

export interface OnboardingDraft {
  currentStep: number;
  startedAt: number;
  university: string;
  otherUniversity: string;
  programme: string;
  yearOfStudy: number | null;
  currentSemester: number;
  academicYear: string;
  courses: OnboardingCourseDraft[];
  targetCGPA: number | null;
  scores: Record<string, number | null>;
  completed: boolean;
}

export interface OnboardingMetrics {
  stepReached: Record<string, number>;
  stepSkipped: Record<string, number>;
  completed: number;
  timeToFirstCgpaMs: number | null;
}

export interface SetupReminderState {
  lastShownAt: number | null;
  snoozedUntil: number | null;
  dismissals: number;
  notificationsEnabled?: boolean;
}

export interface OnboardingLocalState {
  user_id: string;
  draft: OnboardingDraft | null;
  metrics: OnboardingMetrics;
  reminder: SetupReminderState;
  updated_at: string;
}

export function getDefaultAcademicYear(date = new Date()) {
  const year = date.getFullYear();
  const academicStartYear = date.getMonth() >= 7 ? year : year - 1;
  return `${academicStartYear}/${academicStartYear + 1}`;
}

export function createOnboardingDraft(now = Date.now()): OnboardingDraft {
  return {
    currentStep: 0,
    startedAt: now,
    university: '',
    otherUniversity: '',
    programme: '',
    yearOfStudy: null,
    currentSemester: 1,
    academicYear: getDefaultAcademicYear(new Date(now)),
    courses: [],
    targetCGPA: null,
    scores: {},
    completed: false,
  };
}

export function parseCourseList(value: string): OnboardingCourseDraft[] {
  return value
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*(?:cu|credits?)?$/i);
      const parsedCredits = match ? Number(match[2]) : 3;
      return {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        name: (match?.[1] ?? item).trim(),
        creditUnits: Number.isInteger(parsedCredits) && parsedCredits >= 1 && parsedCredits <= 6
          ? parsedCredits
          : 3,
      };
    })
    .filter((course) => course.name.length > 0);
}

export function getSetupCompleteness(data: AppData) {
  const profile = data.settings;
  const profileFields = [
    profile.university,
    profile.programme,
    profile.yearOfStudy,
    profile.currentSemester,
    profile.academicYear,
  ];
  const profileScore = profileFields.filter((value) => value !== undefined && value !== null && String(value).trim()).length / profileFields.length;
  const courseCount = data.courses.length;
  const assessedCourseScore = courseCount
    ? data.courses.filter((course) => course.assessments.length > 0).length / courseCount
    : 0;
  const topicCourseScore = courseCount
    ? data.courses.filter((course) => course.topics.length > 0).length / courseCount
    : 0;
  const targetScore = profile.targetSet === false ? 0 : 1;
  const percentage = Math.round((profileScore * 0.25 + targetScore * 0.25 + assessedCourseScore * 0.25 + topicCourseScore * 0.25) * 100);

  const nextStep = !profile.university || !profile.programme
    ? { label: 'Add your university and programme', to: '/onboarding' }
    : !targetScore
      ? { label: 'Set a target CGPA', to: '/onboarding' }
      : data.courses.length === 0
        ? { label: 'Add your first course units', to: '/onboarding' }
      : data.courses.find((course) => course.assessments.length === 0)
        ? { label: `Add results for ${data.courses.find((course) => course.assessments.length === 0)!.name}`, to: `/course/${data.courses.find((course) => course.assessments.length === 0)!.id}` }
        : data.courses.find((course) => course.topics.length === 0)
          ? { label: `Add topics for ${data.courses.find((course) => course.topics.length === 0)!.name}`, to: `/course/${data.courses.find((course) => course.topics.length === 0)!.id}` }
          : null;

  return { percentage, nextStep };
}

export function shouldShowSetupReminder(reminder: SetupReminderState, now = Date.now()) {
  return reminder.dismissals < 3 && !(reminder.snoozedUntil && reminder.snoozedUntil > now);
}
