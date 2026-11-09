export interface Assessment {
  id: string;
  name: string;
  weight: number;
  obtained: number | null;
  total: number;
}

export interface CourseTopic {
  id: string;
  title: string;
  completed: boolean;
}

export interface CourseDocument {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadDate: number;
  fileUrl: string;
}

export interface CourseUnit {
  id: string;
  name: string;
  code: string;
  creditUnits: number;
  targetGradePoint: number;
  targetUsesGlobal?: boolean;
  semesterId: string;
  assessments: Assessment[];
  topics: CourseTopic[];
  documents: CourseDocument[];
  createdAt: number;
}

export interface Semester {
  id: string;
  academicYear: string;
  semesterNumber: number;
  createdAt: number;
}

export interface ProgrammeAnchor {
  academicYear: string;
  year: number;
  semester: number;
  programDurationYears: number;
}

export interface AppSettings {
  targetCGPA: number;
  customTargetCGPA?: number | null;
  targetSet?: boolean;
  profileName?: string;
  university?: string;
  programme?: string;
  yearOfStudy?: number;
  programmeAnchor?: ProgrammeAnchor | null;
  programmeJoinedAcademicYear?: string | null;
  programmeFinishDateOverride?: string | null;
  currentSemester?: number;
  academicYear?: string;
  onboardingCompleted?: boolean;
  onboardingDraft?: unknown;
  profilePicture?: string;
}

export interface AppData {
  semesters: Semester[];
  courses: CourseUnit[];
  settings: AppSettings;
}

export const GRADE_SCALE: { gp: number; label: string; minPercent: number }[] = [
  { gp: 5.0, label: 'A', minPercent: 80 },
  { gp: 4.5, label: 'B+', minPercent: 75 },
  { gp: 4.0, label: 'B', minPercent: 70 },
  { gp: 3.5, label: 'C+', minPercent: 65 },
  { gp: 3.0, label: 'C', minPercent: 60 },
  { gp: 2.5, label: 'D+', minPercent: 55 },
  { gp: 2.0, label: 'D', minPercent: 50 },
  { gp: 0.0, label: 'F', minPercent: 0 },
];

export const MAX_GRADE_POINT = Math.max(...GRADE_SCALE.map((grade) => grade.gp));
export const TARGET_CGPA = MAX_GRADE_POINT;

export function minPercentForGradePoint(gp: number): number {
  const normalized = Number.isFinite(gp) ? Math.max(0, Math.min(MAX_GRADE_POINT, gp)) : MAX_GRADE_POINT;
  return GRADE_SCALE.slice().reverse().find((grade) => grade.gp >= normalized)?.minPercent
    ?? GRADE_SCALE[0].minPercent;
}

export function gradeLabelForGradePoint(gp: number): string {
  const normalized = Number.isFinite(gp) ? Math.max(0, Math.min(MAX_GRADE_POINT, gp)) : MAX_GRADE_POINT;
  return GRADE_SCALE.slice().reverse().find((grade) => grade.gp >= normalized)?.label
    ?? GRADE_SCALE[0].label;
}

export function getGradePoint(percentage: number): number {
  for (const g of GRADE_SCALE) {
    if (percentage >= g.minPercent) return g.gp;
  }
  return 0.0;
}

export function getGradeLabel(percentage: number): string {
  for (const g of GRADE_SCALE) {
    if (percentage >= g.minPercent) return g.label;
  }
  return 'F';
}

export function getGradeColor(gp: number): string {
  if (gp >= 4.5) return 'success';
  if (gp >= 3.5) return 'primary';
  if (gp >= 2.5) return 'secondary';
  if (gp >= 1.5) return 'warning';
  return 'error';
}

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function courseAggregatePercent(course: CourseUnit): number | null {
  if (course.assessments.length === 0) return null;
  let totalWeighted = 0;
  let totalWeight = 0;
  let hasScore = false;
  for (const a of course.assessments) {
    if (a.weight > 0) {
      totalWeight += a.weight;
      if (a.obtained !== null && a.total > 0) {
        totalWeighted += (a.obtained / a.total) * a.weight;
        hasScore = true;
      }
    }
  }
  if (!hasScore || totalWeight === 0) return null;
  return (totalWeighted / totalWeight) * 100;
}

export function courseCurrentGP(course: CourseUnit): number | null {
  const pct = courseAggregatePercent(course);
  if (pct === null) return null;
  return getGradePoint(pct);
}

export function semesterGPA(courses: CourseUnit[], semesterId: string): number | null {
  const semCourses = courses.filter((c) => c.semesterId === semesterId);
  if (semCourses.length === 0) return null;
  let totalWeightedGP = 0;
  let totalCU = 0;
  let hasGraded = false;
  for (const c of semCourses) {
    const gp = courseCurrentGP(c);
    if (gp !== null) {
      totalWeightedGP += gp * c.creditUnits;
      totalCU += c.creditUnits;
      hasGraded = true;
    }
  }
  if (!hasGraded || totalCU === 0) return null;
  return totalWeightedGP / totalCU;
}

export function cgpa(courses: CourseUnit[]): number | null {
  let totalWeightedGP = 0;
  let totalCU = 0;
  let hasGraded = false;
  for (const c of courses) {
    const gp = courseCurrentGP(c);
    if (gp !== null) {
      totalWeightedGP += gp * c.creditUnits;
      totalCU += c.creditUnits;
      hasGraded = true;
    }
  }
  if (!hasGraded || totalCU === 0) return null;
  return totalWeightedGP / totalCU;
}

export function totalCompletedCredits(courses: CourseUnit[]): number {
  return courses.reduce((sum, c) => {
    return courseCurrentGP(c) !== null ? sum + c.creditUnits : sum;
  }, 0);
}

export function totalCredits(courses: CourseUnit[]): number {
  return courses.reduce((sum, c) => sum + c.creditUnits, 0);
}

export function formatGPA(value: number | null): string {
  if (value === null) return '--';
  return value.toFixed(2);
}
