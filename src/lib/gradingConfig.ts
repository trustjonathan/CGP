import type { AppSettings, CourseUnit } from './types';
import {
  GRADE_SCALE,
  MAX_GRADE_POINT,
  getGradePoint,
  gradeLabelForGradePoint,
  minPercentForGradePoint,
} from './types';

export type TargetChoice = 'pass' | 'D' | 'D+' | 'C' | 'C+' | 'B' | 'B+' | 'A' | 'custom' | 'custom-gp';

export const COURSEWORK_EXAM_REQUIREMENT = { minimum: 20, total: 40 };

export interface ExtendedAppSettings extends AppSettings {
  customTargetPercent?: number | null;
  customTargetCGPA?: number | null;
  targetChoice?: TargetChoice;
  legacyTargetPromptDismissed?: boolean;
}

export type SettingsUpdate = Partial<AppSettings> & Partial<Pick<
  ExtendedAppSettings,
  'customTargetPercent' | 'customTargetCGPA' | 'targetChoice' | 'legacyTargetPromptDismissed'
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
  { value: 'custom-gp', label: 'Custom CGPA' },
];

export function customTargetCGPAForSettings(settings: AppSettings): number | null {
  const value = (settings as ExtendedAppSettings).customTargetCGPA;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_GRADE_POINT
    ? value
    : null;
}

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
  if (customTargetCGPAForSettings(settings) !== null) return 'custom-gp';
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
  if (course.targetUsesGlobal !== false) {
    return customTargetPercentForSettings(settings)
      ?? minPercentForGradePoint(settings.targetCGPA);
  }
  return minPercentForGradePoint(course.targetGradePoint);
}

export function targetLabelForCourse(course: CourseUnit, settings: AppSettings): string {
  if (course.targetUsesGlobal !== false) return targetSummary(settings);
  return `${gradeLabelForGradePoint(course.targetGradePoint)} (${course.targetGradePoint.toFixed(2)} GP)`;
}

export function defaultCourseTarget(settings: AppSettings): number {
  return Number.isFinite(settings.targetCGPA)
    ? Math.max(0, Math.min(MAX_GRADE_POINT, settings.targetCGPA))
    : MAX_GRADE_POINT;
}

export function targetChoiceForGradePoint(gp: number): TargetChoice {
  const exactGrade = GRADE_SCALE.find((grade) => grade.gp === gp);
  if (!exactGrade) return 'custom-gp';
  const label = exactGrade.label;
  if (label === 'F') return 'custom-gp';
  return TARGET_OPTIONS.some((option) => option.value === label)
    ? label as Exclude<TargetChoice, 'pass' | 'custom'>
    : 'custom-gp';
}

export function gradePointForTargetChoice(
  choice: TargetChoice,
  customPercent?: number | null,
  customCGPA?: number | null,
): number | null {
  if (choice === 'custom') {
    return typeof customPercent === 'number' && Number.isFinite(customPercent)
      && customPercent >= 0 && customPercent <= 100
      ? getGradePoint(customPercent)
      : null;
  }
  if (choice === 'custom-gp') {
    return typeof customCGPA === 'number' && Number.isFinite(customCGPA)
      && customCGPA >= 0 && customCGPA <= MAX_GRADE_POINT
      ? customCGPA
      : null;
  }
  return TARGET_OPTIONS.find((option) => option.value === choice)?.gradePoint ?? null;
}

export function targetSummary(settings: AppSettings): string {
  if (settings.targetSet === false) return 'Not set';
  const customCGPA = customTargetCGPAForSettings(settings);
  if (customCGPA !== null) return `Custom ${customCGPA.toFixed(2)} GP`;
  const customTarget = customTargetPercentForSettings(settings);
  if (customTarget !== null) return `Custom ${customTarget}%`;
  const choice = targetChoiceForSettings(settings);
  if (choice === 'custom-gp') return `Custom ${settings.targetCGPA.toFixed(2)} GP`;
  const label = TARGET_OPTIONS.find((option) => option.value === choice)?.label
    ?? gradeLabelForGradePoint(settings.targetCGPA);
  return `${label} · ${settings.targetCGPA.toFixed(2)} GP`;
}
