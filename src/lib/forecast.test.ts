import { describe, expect, it } from 'vitest';
import type { Assessment, CourseUnit } from './types';
import { calculateCourseForecast, getGapToTarget, runWhatIf } from './forecast';
import {
  cgpa,
  courseCurrentGP,
  courseOfficialGP,
  isCourseOfficiallyComplete,
  LEGACY_COURSE_COMPLETED_DEFAULT,
  semesterGPA,
} from './types';

function makeCourse(assessments: Assessment[], completed = true): CourseUnit {
  return {
    id: 'course',
    name: 'Course',
    code: 'COURSE101',
    creditUnits: 3,
    targetGradePoint: 5,
    semesterId: 'semester',
    assessments,
    topics: [],
    documents: [],
    createdAt: 0,
    completed,
  };
}

function assessment(
  id: string,
  weight: number,
  obtained: number | null,
  total: number,
): Assessment {
  return { id, name: id, weight, obtained, total };
}

describe('course forecast', () => {
  it('treats a CGPA equal to the exact custom target as on target', () => {
    expect(getGapToTarget(4.4, 4.4)).toEqual({ gap: 0, status: 'on-track' });
  });

  it('calculates needed points against remaining weight', () => {
    const course = makeCourse([
      assessment('coursework', 40, 39, 40),
      assessment('exam', 60, null, 100),
    ]);

    const result = calculateCourseForecast(course, 80);

    expect(result.requiredPoints).toBe(41);
    expect(result.remainingWeight).toBe(60);
    expect(result.requiredPercent).toBeCloseTo(68.3, 1);
    expect(result.assessmentRequirements[0]).toMatchObject({
      requiredPoints: 69,
      requiredPercent: expect.closeTo(68.3, 1),
    });
  });

  it('reports an already-secured target with remaining work', () => {
    const course = makeCourse([
      assessment('completed', 70, 60, 70),
      assessment('remaining', 30, null, 100),
    ]);

    const result = calculateCourseForecast(course, 50);

    expect(result.status).toBe('already secured');
    expect(result.requiredPoints).toBe(0);
    expect(result.requiredPercent).toBe(0);
  });

  it('reports an unreachable target and the best reachable grade', () => {
    const course = makeCourse([
      assessment('coursework', 40, 0, 40),
      assessment('exam', 60, null, 100),
    ]);

    const result = calculateCourseForecast(course, 80);

    expect(result.status).toBe('not reachable');
    expect(result.requiredPercent).toBeCloseTo(133.3, 1);
    expect(result.bestReachablePercent).toBe(60);
    expect(result.bestReachableGrade).toBe('C');
  });

  it('handles courses with no remaining assessment weight', () => {
    const course = makeCourse([assessment('completed', 100, 40, 100)]);

    const result = calculateCourseForecast(course, 80);

    expect(result.hasRemaining).toBe(false);
    expect(result.remainingWeight).toBe(0);
    expect(result.requiredPoints).toBeNull();
    expect(result.requiredPercent).toBeNull();
    expect(result.status).toBe('not reachable');
  });

  it('calculates the pass target from a 50 percent total', () => {
    const course = makeCourse([
      assessment('coursework', 40, 39, 40),
      assessment('exam', 60, null, 100),
    ]);

    const result = calculateCourseForecast(course, 50);

    expect(result.requiredPoints).toBe(11);
    expect(result.requiredPercent).toBeCloseTo(18.3, 1);
  });

  it('keeps course and simulator forecast values in parity', () => {
    const course = makeCourse([
      assessment('coursework', 40, 39, 40),
      assessment('exam', 60, null, 100),
    ]);
    const coursePageForecast = calculateCourseForecast(course, 80);
    const simulatorForecast = runWhatIf(
      [course],
      { [course.id]: 70 },
      {},
      { [course.id]: 80 },
    ).courseProjections[0].forecast;

    expect(simulatorForecast.requiredPoints).toBe(coursePageForecast.requiredPoints);
    expect(simulatorForecast.remainingWeight).toBe(coursePageForecast.remainingWeight);
    expect(simulatorForecast.requiredPercent).toBe(coursePageForecast.requiredPercent);
  });

  it('excludes incomplete courses from the official semester GPA and CGPA', () => {
    const incomplete = makeCourse([
      assessment('coursework', 40, 39, 40),
      assessment('exam', 60, null, 100),
    ], false);
    const complete = makeCourse([
      assessment('coursework', 40, 39, 40),
      assessment('exam', 60, 50, 60),
    ], true);

    expect(courseCurrentGP(incomplete)).toBe(0);
    expect(semesterGPA([incomplete, complete], 'semester')).toBe(5);
    expect(cgpa([incomplete, complete])).toBe(5);
  });

  it('keeps unmarked courses out of the official GPA even when they are still in progress', () => {
    const incomplete = makeCourse([
      assessment('coursework', 40, null, 40),
      assessment('exam', 60, null, 100),
    ], false);
    const complete = makeCourse([
      assessment('coursework', 40, 39, 40),
      assessment('exam', 60, 50, 60),
    ], true);

    expect(semesterGPA([incomplete, complete], 'semester')).toBe(5);
    expect(cgpa([incomplete, complete])).toBe(5);
  });

  it('treats a missing completion flag as legacy-complete and false as in-progress', () => {
    const legacy = makeCourse([assessment('result', 100, 75, 100)]);
    delete legacy.completed;
    const inProgress = { ...legacy, completed: false };

    expect(LEGACY_COURSE_COMPLETED_DEFAULT).toBe(true);
    expect(isCourseOfficiallyComplete(legacy)).toBe(true);
    expect(courseOfficialGP(legacy)).toBe(4.5);
    expect(isCourseOfficiallyComplete(inProgress)).toBe(false);
    expect(courseOfficialGP(inProgress)).toBeNull();
    expect(cgpa([legacy, inProgress])).toBe(4.5);
  });

  it('keeps what-if projections separate and does not change marks or official CGPA', () => {
    const inProgress = makeCourse([
      assessment('coursework', 60, 60, 100),
      assessment('exam', 40, null, 100),
    ], false);
    const savedAssessments = structuredClone(inProgress.assessments);

    const projection = runWhatIf(
      [inProgress],
      { [inProgress.id]: 90 },
      {},
      { [inProgress.id]: 80 },
    );

    expect(cgpa([inProgress])).toBeNull();
    expect(projection.projectedCGPA).toBe(4);
    expect(projection.courseProjections[0].projectedPercent).toBe(72);
    expect(inProgress.assessments).toEqual(savedAssessments);
  });
});
