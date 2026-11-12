import {
  GRADE_SCALE,
  cgpa as calculateCgpa,
  courseCurrentGP,
  isCourseOfficiallyComplete,
  semesterGPA as calculateSemesterGpa,
  type CourseUnit,
  type Semester,
} from '../types';

export interface CourseWeight {
  courseId: string;
  courseName: string;
  creditUnits: number;
  percent: number | null;
}

export interface ScoreCoverage {
  scored: number;
  total: number;
  status: 'empty' | 'partial' | 'complete';
  label: string;
}

export interface RequiredAverageResult {
  status: 'reachable' | 'not reachable' | 'already secured';
  average: number | null;
}

export interface HonoursBracket {
  label: string;
  minimum: number;
  maximum: number;
}

export const HONOURS_BRACKETS: HonoursBracket[] = [
  { label: 'First Class (Honours)', minimum: 4.4, maximum: 5 },
  { label: 'Second Class Honours (Upper Division)', minimum: 3.6, maximum: 4.39 },
  { label: 'Second Class Honours (Lower Division)', minimum: 2.8, maximum: 3.59 },
  { label: 'Pass', minimum: 2, maximum: 2.79 },
];

export const MINIMUM_GRADUATION_CGPA = 2;

export interface TrajectoryPoint {
  semesterId: string;
  label: string;
  semesterGpa: number | null;
  cumulativeCgpa: number | null;
  projectedSemesterGpa: number | null;
  projectedCgpa: number | null;
}

export interface CourseContribution {
  courseId: string;
  courseName: string;
  creditUnits: number;
  gradePoint: number | null;
  qualityPoints: number | null;
  percentOfEnteredQualityPoints: number | null;
}

export interface SemesterBaseline {
  id: string;
  label: string;
  gpa: number;
  credits: number;
}

export interface AcademicBaseline {
  cgpa: number | null;
  creditsEarned: number | null;
  semesters: SemesterBaseline[];
}

export interface AcademicBaselineInput {
  cgpa: string;
  creditsEarned: string;
  semesters: Array<{ id: string; label: string; gpa: string; credits: string }>;
}

export interface AcademicTotals {
  qualityPoints: number;
  credits: number;
  cgpa: number | null;
}

const maximumGradePoint = Math.max(...GRADE_SCALE.map(({ gp }) => gp));

export function parseAcademicBaseline(input: AcademicBaselineInput): AcademicBaseline {
  const cgpa = Number(input.cgpa);
  const creditsEarned = Number(input.creditsEarned);
  const hasOverall = input.cgpa.trim() !== ''
    && input.creditsEarned.trim() !== ''
    && Number.isFinite(cgpa)
    && cgpa >= 0
    && cgpa <= maximumGradePoint
    && Number.isFinite(creditsEarned)
    && creditsEarned > 0;
  const semesters = input.semesters.flatMap((semester) => {
    const gpa = Number(semester.gpa);
    const credits = Number(semester.credits);
    if (!semester.gpa.trim()
      || !semester.credits.trim()
      || !Number.isFinite(gpa)
      || gpa < 0
      || gpa > maximumGradePoint
      || !Number.isFinite(credits)
      || credits <= 0) return [];
    return [{ id: semester.id, label: semester.label.trim(), gpa, credits }];
  });

  return {
    cgpa: hasOverall ? cgpa : null,
    creditsEarned: hasOverall ? creditsEarned : null,
    semesters,
  };
}

function hasValidScores(course: CourseUnit): boolean {
  return course.assessments.every((assessment) => {
    if (assessment.obtained === null) return true;
    return Number.isFinite(assessment.obtained)
      && Number.isFinite(assessment.total)
      && assessment.total > 0
      && assessment.obtained >= 0
      && assessment.obtained <= assessment.total;
  });
}

function validCourses(courses: CourseUnit[]): CourseUnit[] {
  return courses.filter((course) => Number.isFinite(course.creditUnits)
    && course.creditUnits > 0
    && hasValidScores(course));
}

export function courseWeights(courses: CourseUnit[]): CourseWeight[] {
  const enteredCourses = courses.filter((course) => Number.isFinite(course.creditUnits)
    && course.creditUnits > 0);
  const total = enteredCourses.reduce((sum, course) => sum + course.creditUnits, 0);

  return enteredCourses.map((course) => ({
    courseId: course.id,
    courseName: course.name,
    creditUnits: course.creditUnits,
    percent: total > 0 ? (course.creditUnits / total) * 100 : null,
  }));
}

export function scoreCoverage(courses: CourseUnit[]): ScoreCoverage {
  const entered = courses.filter((course) => Number.isFinite(course.creditUnits)
    && course.creditUnits > 0);
  const scored = validCourses(entered).filter((course) => courseCurrentGP(course) !== null).length;
  const total = entered.length;
  const status = total === 0 || scored === 0
    ? 'empty'
    : scored === total
      ? 'complete'
      : 'partial';

  return { scored, total, status, label: `${scored} of ${total} courses scored` };
}

export function semesterGpa(courses: CourseUnit[], semesterId: string): number | null {
  return calculateSemesterGpa(validCourses(courses), semesterId);
}

export function provisionalSemesterGpa(courses: CourseUnit[], semesterId: string): number | null {
  const contributions = provisionalCourseContributions(
    courses.filter((course) => course.semesterId === semesterId),
  );
  const credits = contributions.reduce((sum, course) => sum + course.creditUnits, 0);
  if (credits === 0) return null;
  const qualityPoints = contributions.reduce((sum, course) => sum + (course.qualityPoints ?? 0), 0);
  return qualityPoints / credits;
}

export function cumulativeCgpa(courses: CourseUnit[]): number | null {
  return calculateCgpa(validCourses(courses));
}

export function academicTotals(
  courses: CourseUnit[],
  baseline?: AcademicBaseline,
): AcademicTotals {
  const courseTotals = courseContributions(courses).reduce(
    (totals, course) => ({
      qualityPoints: totals.qualityPoints + (course.qualityPoints ?? 0),
      credits: totals.credits + course.creditUnits,
    }),
    { qualityPoints: 0, credits: 0 },
  );
  const semesters = baseline?.semesters.filter((semester) =>
    Number.isFinite(semester.gpa)
    && semester.gpa >= 0
    && semester.gpa <= maximumGradePoint
    && Number.isFinite(semester.credits)
    && semester.credits > 0) ?? [];
  const baselineTotals = semesters.length > 0
    ? semesters.reduce((totals, semester) => ({
      qualityPoints: totals.qualityPoints + semester.gpa * semester.credits,
      credits: totals.credits + semester.credits,
    }), { qualityPoints: 0, credits: 0 })
    : baseline?.cgpa !== null
      && baseline?.cgpa !== undefined
      && baseline.cgpa >= 0
      && baseline.cgpa <= maximumGradePoint
      && baseline.creditsEarned !== null
      && baseline.creditsEarned !== undefined
      && Number.isFinite(baseline.creditsEarned)
      && baseline.creditsEarned > 0
      ? {
        qualityPoints: baseline.cgpa * baseline.creditsEarned,
        credits: baseline.creditsEarned,
      }
      : { qualityPoints: 0, credits: 0 };
  const qualityPoints = courseTotals.qualityPoints + baselineTotals.qualityPoints;
  const credits = courseTotals.credits + baselineTotals.credits;

  return { qualityPoints, credits, cgpa: credits > 0 ? qualityPoints / credits : null };
}

export function requiredAverageForRemaining(
  target: number,
  creditsDone: number,
  qualityPoints: number,
  remainingCredits: number,
): RequiredAverageResult | null {
  if (!Number.isFinite(target)
    || target < 0
    || !Number.isFinite(creditsDone)
    || creditsDone < 0
    || !Number.isFinite(qualityPoints)
    || qualityPoints < 0
    || !Number.isFinite(remainingCredits)
    || remainingCredits < 0
    || qualityPoints > creditsDone * maximumGradePoint) {
    return null;
  }

  if (target > maximumGradePoint) return { status: 'not reachable', average: null };
  if (creditsDone > 0 && qualityPoints / creditsDone >= target) {
    return { status: 'already secured', average: null };
  }
  if (remainingCredits === 0) return { status: 'not reachable', average: null };

  const average = (target * (creditsDone + remainingCredits) - qualityPoints) / remainingCredits;
  if (average > maximumGradePoint) return { status: 'not reachable', average: null };
  return { status: 'reachable', average: Math.max(0, average) };
}

export function honoursBracketFor(
  target: number,
  brackets: HonoursBracket[] = HONOURS_BRACKETS,
): HonoursBracket | null {
  if (!Number.isFinite(target)) return null;
  return brackets.find((bracket) => Number.isFinite(bracket.minimum)
    && Number.isFinite(bracket.maximum)
    && bracket.minimum <= target
    && target <= bracket.maximum) ?? null;
}

export function trajectorySeries(
  semesters: Semester[],
  courses: CourseUnit[],
  projected: Record<string, { semesterGpa: number; cumulativeCgpa: number }> = {},
): TrajectoryPoint[] {
  const orderedSemesters = semesters.slice().sort((a, b) => a.createdAt - b.createdAt);
  let coursesThroughSemester: CourseUnit[] = [];

  return orderedSemesters.map((semester) => {
    coursesThroughSemester = coursesThroughSemester.concat(
      courses.filter((course) => course.semesterId === semester.id),
    );
    const projection = projected[semester.id];
    return {
      semesterId: semester.id,
      label: `Y${semester.academicYear.split('/')[0].slice(-2)} S${semester.semesterNumber}`,
      semesterGpa: semesterGpa(courses, semester.id),
      cumulativeCgpa: cumulativeCgpa(coursesThroughSemester),
      projectedSemesterGpa: projection?.semesterGpa ?? null,
      projectedCgpa: projection?.cumulativeCgpa ?? null,
    };
  });
}

export function trajectoryWithBaseline(
  semesters: Semester[],
  courses: CourseUnit[],
  baseline?: AcademicBaseline,
  projected: Record<string, { semesterGpa: number; cumulativeCgpa: number }> = {},
): TrajectoryPoint[] {
  let runningQualityPoints = 0;
  let runningCredits = 0;
  const baselinePoints = (baseline?.semesters ?? []).map((semester, index) => {
    runningQualityPoints += semester.gpa * semester.credits;
    runningCredits += semester.credits;
    return {
      semesterId: semester.id,
      label: semester.label || `Previous semester ${index + 1}`,
      semesterGpa: semester.gpa,
      cumulativeCgpa: runningCredits > 0 ? runningQualityPoints / runningCredits : null,
      projectedSemesterGpa: null,
      projectedCgpa: null,
    };
  });
  const semesterPoints = semesters.slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((semester) => {
      const semesterCourses = courses.filter((course) => course.semesterId === semester.id);
      const contributions = courseContributions(semesterCourses);
      runningQualityPoints += contributions.reduce((sum, course) => sum + (course.qualityPoints ?? 0), 0);
      runningCredits += contributions.reduce((sum, course) => sum + course.creditUnits, 0);
      const projection = projected[semester.id];
      return {
        semesterId: semester.id,
        label: `Y${semester.academicYear.split('/')[0].slice(-2)} S${semester.semesterNumber}`,
        semesterGpa: semesterGpa(semesterCourses, semester.id),
        cumulativeCgpa: runningCredits > 0 ? runningQualityPoints / runningCredits : null,
        projectedSemesterGpa: projection?.semesterGpa ?? null,
        projectedCgpa: projection?.cumulativeCgpa ?? null,
      };
    });

  return [...baselinePoints, ...semesterPoints];
}

export function courseContributions(courses: CourseUnit[]): CourseContribution[] {
  return buildCourseContributions(courses.filter(isCourseOfficiallyComplete));
}

export function provisionalCourseContributions(courses: CourseUnit[]): CourseContribution[] {
  return buildCourseContributions(courses);
}

function buildCourseContributions(courses: CourseUnit[]): CourseContribution[] {
  const scoredCourses = validCourses(courses)
    .map((course) => ({
      course,
      gradePoint: courseCurrentGP(course),
    }))
    .filter((entry): entry is { course: CourseUnit; gradePoint: number } => entry.gradePoint !== null);
  const totalQualityPoints = scoredCourses.reduce(
    (sum, { course, gradePoint }) => sum + gradePoint * course.creditUnits,
    0,
  );

  return scoredCourses.map(({ course, gradePoint }) => {
    const qualityPoints = gradePoint * course.creditUnits;
    return {
      courseId: course.id,
      courseName: course.name,
      creditUnits: course.creditUnits,
      gradePoint,
      qualityPoints,
      percentOfEnteredQualityPoints: totalQualityPoints > 0
        ? (qualityPoints / totalQualityPoints) * 100
        : null,
    };
  });
}

export function maximumGradePointForScale(): number {
  return maximumGradePoint;
}
