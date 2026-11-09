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
  requiredScore: number | null;
  achievable: boolean;
  currentPercent: number | null;
  remainingWeight: number;
  status: 'already secured' | 'on track' | 'not reachable';
  bestReachablePercent: number;
  bestReachableGrade: string;
  targetPercent: number;
}

export function calculateRequiredMark(course: CourseUnit, targetPercent = minPercentForGradePoint(course.targetGradePoint)): RequiredMarkResult {
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

  if (remainingAssessments.length === 0 || remainingWeight === 0) {
    const secured = currentPct !== null && currentPct >= targetPercent;
    return {
      hasRemaining: false,
      requiredPercent: null,
      requiredScore: null,
      achievable: secured,
      currentPercent: currentPct,
      remainingWeight: 0,
      status: secured ? 'already secured' : 'not reachable',
      bestReachablePercent,
      bestReachableGrade,
      targetPercent,
    };
  }

  const neededWeightedScore = targetPercent * totalWeight / 100;
  const remainingNeeded = neededWeightedScore - earnedScore;
  const requiredPercent = (remainingNeeded / remainingWeight) * 100;

  const achievable = requiredPercent <= 100;
  const status = requiredPercent <= 0
    ? 'already secured'
    : achievable ? 'on track' : 'not reachable';

  const avgTotal = remainingAssessments.reduce((s, a) => s + a.total, 0) / remainingAssessments.length;
  const requiredScore = Math.max(0, Math.ceil((requiredPercent / 100) * avgTotal));

  return {
    hasRemaining: true,
    requiredPercent: Math.max(0, Math.min(100, requiredPercent)),
    requiredScore,
    achievable,
    currentPercent: currentPct,
    remainingWeight,
    status,
    bestReachablePercent,
    bestReachableGrade,
    targetPercent,
  };
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
  }[];
}

export function runWhatIf(
  courses: CourseUnit[],
  projectedScores: Record<string, number>,
  defaultScores: Record<string, number> = {},
): WhatIfResult {
  const courseProjections = courses.map((c) => {
    let earnedWeight = 0;
    let earnedScore = 0;
    let remainingWeight = 0;

    for (const a of c.assessments) {
      if (a.weight > 0) {
        if (a.obtained !== null && a.total > 0) {
          earnedWeight += a.weight;
          earnedScore += (a.obtained / a.total) * a.weight;
        } else {
          remainingWeight += a.weight;
        }
      }
    }

    const projectedPct = projectedScores[c.id]
      ?? defaultScores[c.id]
      ?? minPercentForGradePoint(c.targetGradePoint);
    const totalWeight = earnedWeight + remainingWeight;
    const projectedWeighted =
      earnedScore + (remainingWeight > 0 ? (projectedPct / 100) * remainingWeight : 0);
    const finalPercent = totalWeight > 0 ? (projectedWeighted / totalWeight) * 100 : projectedPct;
    const gp = getGradePoint(finalPercent);

    return {
      courseId: c.id,
      courseName: c.name,
      code: c.code,
      creditUnits: c.creditUnits,
      projectedPercent: finalPercent,
      projectedGP: gp,
      gradeLabel: getGradeLabel(finalPercent),
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
