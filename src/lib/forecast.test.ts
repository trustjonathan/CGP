import { describe, expect, it } from 'vitest';
import type { Assessment, CourseUnit } from './types';
import { calculateCourseForecast, getGapToTarget, runWhatIf } from './forecast';

function makeCourse(assessments: Assessment[]): CourseUnit {
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
});
