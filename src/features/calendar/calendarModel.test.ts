import { describe, expect, it } from 'vitest';
import type { CourseUnit } from '@/lib/types';
import {
  deriveJoinedAcademicYear,
  formatCountdown,
  getCourseworkProgress,
  getMilestoneDaysRemaining,
  getSelectedCalendarSemester,
  getUpcomingCalendarMilestones,
  programmeRemaining,
  validateProgrammeAnchor,
} from './calendarModel';

function course(id: string, assessments: CourseUnit['assessments']): CourseUnit {
  return {
    id,
    name: `Course ${id}`,
    code: id,
    creditUnits: 3,
    targetGradePoint: 5,
    semesterId: 'semester',
    assessments,
    topics: [],
    documents: [],
    createdAt: 0,
  };
}

describe('calendar page model', () => {
  it('selects the current semester and sorts future milestones', () => {
    expect(getSelectedCalendarSemester('2026-11-09')?.number).toBe(1);
    expect(getUpcomingCalendarMilestones('2026-11-09', 2).map((milestone) => milestone.date)).toEqual([
      '2026-11-27',
      '2026-12-18',
    ]);
  });

  it('calculates milestone countdowns using calendar days', () => {
    expect(getMilestoneDaysRemaining('2026-11-27', '2026-11-09')).toBe(18);
  });

  it('formats countdown strings for the current range rules', () => {
    expect(formatCountdown('2026-11-27', '2026-11-09')).toBe('18 days');
    expect(formatCountdown('2027-03-03', '2026-11-09')).toBe('3 months, 22 days');
    expect(formatCountdown('2026-11-10', '2026-11-09')).toBe('1d 8h');
    expect(formatCountdown(new Date(2026, 10, 9, 12, 0, 0), new Date(2026, 10, 9, 10, 0, 0))).toBe('02:00:00');
  });

  it('calculates remaining semesters and finish estimate from the programme anchor', () => {
    expect(programmeRemaining({
      academicYear: '2026/2027',
      year: 3,
      semester: 1,
      programDurationYears: 4,
    }, '2026-11-09')).toMatchObject({
      semestersDone: 4,
      semestersLeft: 4,
      finishDate: '2028-05-30',
    });

    expect(programmeRemaining({
      academicYear: '2026/2027',
      year: 1,
      semester: 1,
      programDurationYears: 4,
    }, '2026-11-09')).toMatchObject({
      semestersDone: 0,
      semestersLeft: 8,
      finishDate: '2030-05-30',
    });

    expect(programmeRemaining({
      academicYear: '2026/2027',
      year: 4,
      semester: 2,
      programDurationYears: 4,
    }, '2026-11-09')).toMatchObject({
      semestersDone: 7,
      semestersLeft: 1,
      finishDate: '2027-05-30',
    });
  });

  it('supports 3-year and 5-year programme durations', () => {
    expect(programmeRemaining({
      academicYear: '2026/2027',
      year: 1,
      semester: 1,
      programDurationYears: 3,
    }, '2026-11-09')).toMatchObject({ semestersLeft: 6, finishDate: '2029-05-30' });
    expect(programmeRemaining({
      academicYear: '2026/2027',
      year: 1,
      semester: 1,
      programDurationYears: 5,
    }, '2026-11-09')).toMatchObject({ semestersLeft: 10, finishDate: '2031-05-30' });
  });

  it('warns when the programme exceeds its duration but remains within maximum stay', () => {
    const result = programmeRemaining({
      academicYear: '2026/2027',
      year: 5,
      semester: 1,
      programDurationYears: 4,
    }, '2026-11-09');

    expect(result).toMatchObject({
      semestersLeft: 0,
      validationSeverity: 'warning',
    });
    expect(result.validationMessage).toContain('maximum stay');
    expect(validateProgrammeAnchor(5, 4).severity).toBe('warning');
  });

  it('validates year beyond the maximum stay and derives a joined-year label', () => {
    expect(validateProgrammeAnchor(7, 4).message).toContain('maximum stay of 6 years');
    expect(deriveJoinedAcademicYear('2026/2027', 3)).toBe('2024/2025');
  });

  it('counts marked coursework assessments and identifies courses without any marks', () => {
    const result = getCourseworkProgress([
      course('marked', [
        { id: 'a', name: 'CAT 1', weight: 20, obtained: 15, total: 20 },
        { id: 'b', name: 'Assignment 1', weight: 20, obtained: 18, total: 20 },
      ]),
      course('unmarked', [{ id: 'c', name: 'Test 1', weight: 20, obtained: null, total: 20 }]),
      course('missing', [{ id: 'c', name: 'Exam', weight: 60, obtained: null, total: 100 }]),
      course('onboarding-result', [
        { id: 'd', name: 'Current result', weight: 100, obtained: 72, total: 100 },
      ]),
    ]);

    expect(result.completed).toBe(2);
    expect(result.total).toBe(3);
    expect(result.coursesNeedingMarks.map(({ id }) => id)).toEqual(['unmarked', 'missing']);
  });
});
