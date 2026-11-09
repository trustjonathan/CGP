import type { AppSettings, CourseUnit } from './types';
import {
  GRADE_SCALE,
  MAX_GRADE_POINT,
  getGradePoint,
  gradeLabelForGradePoint,
  minPercentForGradePoint,
} from './types';

export type TargetChoice = 'pass' | 'D' | 'D+' | 'C' | 'C+' | 'B' | 'B+' | 'A' | 'custom';

export const COURSEWORK_EXAM_REQUIREMENT = { minimum: 20, total: 40 };

export interface ExtendedAppSettings extends AppSettings {
  customTargetPercent?: number | null;
  targetChoice?: TargetChoice;
  legacyTargetPromptDismissed?: boolean;
}

export type SettingsUpdate = Partial<AppSettings> & Partial<Pick<
  ExtendedAppSettings,
  'customTargetPercent' | 'targetChoice' | 'legacyTargetPromptDismissed'
>>;

function gradePointForLabel(label: string): number {
  return GRADE_SCALE.find((grade) => grade.label === label)?.gp ?? MAX_GRADE_POINT;
}

export const TARGET_OPTIONS: { value: TargetChoice; label: string; gradePoint?: number }[] = [
  {
    value: 'pass',
    label: `Pass (${minPercentForGradePoint(gradePointForLabel('D'))}%)`,
    gradePoint: gradePointForLabel('D'),
  },
  ...(['D', 'D+', 'C', 'C+', 'B', 'B+', 'A'] as const).map((label) => ({
    value: label,
    label: `${label} (${minPercentForGradePoint(gradePointForLabel(label))}%)`,
    gradePoint: gradePointForLabel(label),
  })),
  { value: 'custom', label: 'Custom %' },
];

export function customTargetPercentForSettings(settings: AppSettings): number | null {
  const value = (settings as ExtendedAppSettings).customTargetPercent;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

export function targetChoiceForSettings(settings: AppSettings): TargetChoice {
  const savedChoice = (settings as ExtendedAppSettings).targetChoice;
  const savedOption = TARGET_OPTIONS.find((option) => option.value === savedChoice);
  if (savedOption) return savedOption.value;
  if (customTargetPercentForSettings(settings) !== null) return 'custom';
  return targetChoiceForGradePoint(settings.targetCGPA);
}

export function legacyTargetPromptWasDismissed(settings: AppSettings): boolean {
  return (settings as ExtendedAppSettings).legacyTargetPromptDismissed === true;
}

export function targetPercentForSettings(settings: AppSettings): number {
  return customTargetPercentForSettings(settings)
    ?? minPercentForGradePoint(settings.targetCGPA);
}

export function targetPercentForCourse(course: CourseUnit, settings: AppSettings): number {
  const customTarget = customTargetPercentForSettings(settings);
  if (customTarget !== null && course.targetGradePoint === settings.targetCGPA) {
    return customTarget;
  }
  return minPercentForGradePoint(course.targetGradePoint);
}

export function defaultCourseTarget(settings: AppSettings): number {
  return Number.isFinite(settings.targetCGPA)
    ? Math.max(0, Math.min(MAX_GRADE_POINT, settings.targetCGPA))
    : MAX_GRADE_POINT;
}

export function targetChoiceForGradePoint(gp: number): TargetChoice {
  const label = gradeLabelForGradePoint(gp);
  if (label === 'F') return 'custom';
  return TARGET_OPTIONS.some((option) => option.value === label)
    ? label as Exclude<TargetChoice, 'pass' | 'custom'>
    : 'custom';
}

export function gradePointForTargetChoice(choice: TargetChoice, customPercent?: number | null): number | null {
  if (choice === 'custom') {
    return typeof customPercent === 'number' && Number.isFinite(customPercent)
      && customPercent >= 0 && customPercent <= 100
      ? getGradePoint(customPercent)
      : null;
  }
  return TARGET_OPTIONS.find((option) => option.value === choice)?.gradePoint ?? null;
}

export function targetSummary(settings: AppSettings): string {
  if (settings.targetSet === false) return 'Not set';
  const customTarget = customTargetPercentForSettings(settings);
  if (customTarget !== null) return `Custom ${customTarget}%`;
  const choice = targetChoiceForSettings(settings);
  const label = TARGET_OPTIONS.find((option) => option.value === choice)?.label
    ?? gradeLabelForGradePoint(settings.targetCGPA);
  return `${label} · ${settings.targetCGPA.toFixed(2)} GP`;
}
