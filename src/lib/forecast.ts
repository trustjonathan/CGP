import type { CourseUnit, Assessment } from './types';
import {
  TARGET_CGPA,
  getGradePoint,
  getGradeLabel,
  courseAggregatePercent,
  cgpa,
  minPercentForGradePoint,
} from './types';

export interface RequiredMarkResult {
  hasRemaining: boolean;
  requiredPercent: number | null;
  requiredPoints: number | null;
  achievable: boolean;
  currentPercent: number | null;
  remainingWeight: number;
  status: 'already secured' | 'on track' | 'not reachable';
  bestReachablePercent: number;
  bestReachableGrade: string;
  targetPercent: number;
  assessmentRequirements: {
    assessmentId: string;
    name: string;
    total: number;
    requiredPoints: number | null;
    requiredPercent: number | null;
  }[];
  projectedPercent: number | null;
}

export function calculateCourseForecast(
  course: CourseUnit,
  targetPercent = minPercentForGradePoint(course.targetGradePoint),
  projectedScore?: number,
): RequiredMarkResult {
  if (!Number.isFinite(targetPercent) || targetPercent < 0 || targetPercent > 100) {
    throw new RangeError('The target percentage must be between 0 and 100.');
  }

  const currentPct = courseAggregatePercent(course);

  let earnedWeight = 0;
  let earnedScore = 0;
  let remainingWeight = 0;
  const remainingAssessments: Assessment[] = [];

  for (const a of course.assessments) {
    if (a.weight > 0) {
      if (a.obtained !== null && a.total > 0) {
        earnedWeight += a.weight;
        earnedScore += (a.obtained / a.total) * a.weight;
      } else {
        remainingWeight += a.weight;
        remainingAssessments.push(a);
      }
    }
  }

  const totalWeight = earnedWeight + remainingWeight;
  const bestReachablePercent = totalWeight > 0
    ? ((earnedScore + remainingWeight) / totalWeight) * 100
    : 0;
  const bestReachableGrade = getGradeLabel(bestReachablePercent);
  const projectedPercent = projectedScore === undefined
    ? null
    : totalWeight > 0
      ? ((earnedScore + remainingWeight * Math.max(0, Math.min(100, projectedScore)) / 100) / totalWeight) * 100
      : Math.max(0, Math.min(100, projectedScore));

  let requiredPercent: number | null = null;
  let requiredPoints: number | null = null;
  let status: RequiredMarkResult['status'];
  if (remainingAssessments.length === 0 || remainingWeight === 0) {
    const secured = currentPct !== null && currentPct >= targetPercent;
    status = secured ? 'already secured' : 'not reachable';
  } else {
    const neededWeightedScore = targetPercent * totalWeight / 100;
    const remainingNeeded = neededWeightedScore - earnedScore;
    requiredPoints = Math.max(0, remainingNeeded);
    requiredPercent = Math.max(0, (remainingNeeded / remainingWeight) * 100);
    status = requiredPercent <= 0
      ? 'already secured'
      : requiredPercent <= 100 ? 'on track' : 'not reachable';
  }

  return {
    hasRemaining: remainingAssessments.length > 0 && remainingWeight > 0,
    requiredPercent,
    requiredPoints,
    achievable: status !== 'not reachable',
    currentPercent: currentPct,
    remainingWeight,
    status,
    bestReachablePercent,
    bestReachableGrade,
    targetPercent,
    assessmentRequirements: remainingAssessments.map((assessment) => ({
      assessmentId: assessment.id,
      name: assessment.name,
      total: assessment.total,
      requiredPoints: assessment.total > 0 && requiredPercent !== null
        ? Math.max(0, Math.ceil((requiredPercent / 100) * assessment.total))
        : null,
      requiredPercent,
    })),
    projectedPercent,
  };
}

export function calculateRequiredMark(
  course: CourseUnit,
  targetPercent = minPercentForGradePoint(course.targetGradePoint),
): RequiredMarkResult {
  return calculateCourseForecast(course, targetPercent);
}

export function formatPoints(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export interface WhatIfResult {
  projectedCGPA: number;
  projectedSemesterGPAs: { semesterId: string; gpa: number }[];
  courseProjections: {
    courseId: string;
    courseName: string;
    code: string;
    creditUnits: number;
    projectedPercent: number;
    projectedGP: number;
    gradeLabel: string;
    targetPercent: number;
    forecast: RequiredMarkResult;
  }[];
}

export function runWhatIf(
  courses: CourseUnit[],
  projectedScores: Record<string, number>,
  defaultScores: Record<string, number> = {},
  targetPercents: Record<string, number> = {},
): WhatIfResult {
  const courseProjections = courses.map((c) => {
    const targetPercent = targetPercents[c.id] ?? minPercentForGradePoint(c.targetGradePoint);
    const projectedPct = projectedScores[c.id]
      ?? defaultScores[c.id]
      ?? minPercentForGradePoint(c.targetGradePoint);
    const forecast = calculateCourseForecast(c, targetPercent, projectedPct);
    const finalPercent = forecast.projectedPercent ?? projectedPct;
    const gp = getGradePoint(finalPercent);

    return {
      courseId: c.id,
      courseName: c.name,
      code: c.code,
      creditUnits: c.creditUnits,
      projectedPercent: finalPercent,
      projectedGP: gp,
      gradeLabel: getGradeLabel(finalPercent),
      targetPercent,
      forecast,
    };
  });

  let totalWeightedGP = 0;
  let totalCU = 0;
  for (const cp of courseProjections) {
    totalWeightedGP += cp.projectedGP * cp.creditUnits;
    totalCU += cp.creditUnits;
  }
  const projectedCGPA = totalCU > 0 ? totalWeightedGP / totalCU : 0;

  const semesterIds = Array.from(new Set(courses.map((c) => c.semesterId)));
  const projectedSemesterGPAs = semesterIds.map((sid) => {
    const semCourses = courseProjections.filter((cp) =>
      courses.find((c) => c.id === cp.courseId)?.semesterId === sid
    );
    let swgp = 0;
    let scu = 0;
    for (const cp of semCourses) {
      swgp += cp.projectedGP * cp.creditUnits;
      scu += cp.creditUnits;
    }
    return { semesterId: sid, gpa: scu > 0 ? swgp / scu : 0 };
  });

  return { projectedCGPA, projectedSemesterGPAs, courseProjections };
}

export function getGapToTarget(currentCGPA: number | null, target: number): {
  gap: number;
  status: 'on-track' | 'behind' | 'no-data';
} {
  if (currentCGPA === null) return { gap: 0, status: 'no-data' };
  const gap = target - currentCGPA;
  return { gap, status: gap <= 0 ? 'on-track' : 'behind' };
}

export { TARGET_CGPA, cgpa };
