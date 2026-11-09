import { describe, expect, it } from 'vitest';
import { GRADE_SCALE, getGradePoint, minPercentForGradePoint } from './types';
import {
  customTargetPercentForSettings,
  customTargetCGPAForSettings,
  gradePointForTargetChoice,
  targetChoiceForGradePoint,
  targetLabelForCourse,
  targetChoiceForSettings,
  targetSummary,
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
    expect(targetPercentForCourse({ ...course(4), targetUsesGlobal: false }, settings)).toBe(70);
  });

  it('retains an exact custom CGPA and uses its band for course forecasts', () => {
    const settings: ExtendedAppSettings = {
      targetCGPA: 4.4,
      customTargetCGPA: 4.4,
      targetChoice: 'custom-gp',
    };

    expect(customTargetCGPAForSettings(settings)).toBe(4.4);
    expect(gradePointForTargetChoice('custom-gp', null, 4.4)).toBe(4.4);
    expect(targetPercentForSettings(settings)).toBe(75);
    expect(targetPercentForCourse(course(5), settings)).toBe(75);
    expect(targetLabelForCourse(course(5), settings)).toBe('Custom 4.40 GP');
    expect(targetSummary(settings)).toBe('Custom 4.40 GP');
    expect(targetChoiceForGradePoint(4.4)).toBe('custom-gp');
  });

  it('treats legacy targets as global unless a course override is explicit', () => {
    const settings: ExtendedAppSettings = { targetCGPA: 4.4, targetChoice: 'custom-gp' };

    expect(targetPercentForCourse(course(5), settings)).toBe(75);
    expect(targetPercentForCourse({ ...course(5), targetUsesGlobal: false }, settings)).toBe(80);
    expect(targetLabelForCourse({ ...course(5), targetUsesGlobal: false }, settings)).toBe('A (5.00 GP)');
  });
});
