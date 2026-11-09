import { describe, expect, it } from 'vitest';
import { GRADE_SCALE, getGradePoint, minPercentForGradePoint } from './types';
import {
  customTargetPercentForSettings,
  gradePointForTargetChoice,
  targetChoiceForSettings,
  targetPercentForCourse,
  targetPercentForSettings,
  type ExtendedAppSettings,
} from './gradingConfig';
import type { CourseUnit } from './types';

const course = (targetGradePoint: number): CourseUnit => ({
  id: 'course',
  name: 'Course',
  code: '',
  creditUnits: 3,
  targetGradePoint,
  semesterId: 'semester',
  assessments: [],
  topics: [],
  documents: [],
  createdAt: 0,
});

describe('grading targets', () => {
  it('derives each grade-point threshold from the configured scale', () => {
    for (const grade of GRADE_SCALE) {
      expect(minPercentForGradePoint(grade.gp)).toBe(grade.minPercent);
    }
    expect(minPercentForGradePoint(4.7)).toBe(80);
  });

  it('maps standard target choices from the grade scale', () => {
    const passGradePoint = gradePointForTargetChoice('pass');
    expect(passGradePoint).toBe(2);
    expect(minPercentForGradePoint(passGradePoint ?? 0)).toBe(50);
    const settings: ExtendedAppSettings = { targetCGPA: 2, targetChoice: 'pass' };
    expect(targetChoiceForSettings(settings)).toBe('pass');
  });

  it('preserves custom percentages while deriving the global grade-point band', () => {
    const settings = { targetCGPA: getGradePoint(68.3), customTargetPercent: 68.3 };

    expect(customTargetPercentForSettings(settings)).toBe(68.3);
    expect(targetPercentForSettings(settings)).toBe(68.3);
    expect(targetPercentForCourse(course(settings.targetCGPA), settings)).toBe(68.3);
    expect(targetPercentForCourse(course(4), settings)).toBe(70);
  });
});
