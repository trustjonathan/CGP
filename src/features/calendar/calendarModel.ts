import calendarData from '@/data/calendars/kabale-2026-2027.json';
import type { CourseUnit, ProgrammeAnchor } from '@/lib/types';
import { addCalendarMonths, getDaysUntilCalendarDate, parseCalendarDate } from '@/lib/academicCalendar';

export function getLocalCalendarDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getSelectedCalendarSemester(today: string) {
  parseCalendarDate(today);
  return calendarData.semesters.find((semester) => semester.start <= today && semester.end >= today)
    ?? calendarData.semesters.find((semester) => semester.start > today)
    ?? calendarData.semesters[calendarData.semesters.length - 1]
    ?? null;
}

export function getActiveAcademicYear(today: string) {
  parseCalendarDate(today);
  return calendarData.academicYear;
}

export function getUpcomingCalendarMilestones(today: string, limit = 5) {
  parseCalendarDate(today);
  const milestones = calendarData.semesters.flatMap((semester) => semester.milestones.map((milestone) => ({
    ...milestone,
    semesterNumber: semester.number,
  })));
  const ceremonies = calendarData.ceremonies.map((ceremony, index) => ({
    id: `ceremony-${index}`,
    label: ceremony.label,
    date: ceremony.date,
    type: 'ceremony',
    semesterNumber: calendarData.semesters.find((semester) =>
      ceremony.date >= semester.start && ceremony.date <= semester.end)?.number ?? null,
  }));
  return [...milestones, ...ceremonies]
    .filter((milestone) => milestone.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label))
    .slice(0, limit);
}

export function getSemesterCalendarEvents(semesterNumber: number) {
  const semester = calendarData.semesters.find((item) => item.number === semesterNumber);
  if (!semester) return [];
  const milestones = semester.milestones
    .filter((milestone) => milestone.date >= semester.start && milestone.date <= semester.end);
  const ceremonies = calendarData.ceremonies
    .filter((ceremony) => ceremony.date >= semester.start && ceremony.date <= semester.end)
    .map((ceremony, index) => ({
      id: `ceremony-${index}`,
      label: ceremony.label,
      date: ceremony.date,
      type: 'ceremony',
      endDate: undefined,
    }));
  return [...milestones, ...ceremonies]
    .sort((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label));
}

export function deriveJoinedAcademicYear(academicYear: string, year: number): string | null {
  const match = /^(\d{4})\/(\d{4})$/.exec(academicYear);
  if (!match || !Number.isInteger(year) || year < 1) return null;
  const joinedYear = Number(match[1]) - year + 1;
  return `${joinedYear}/${joinedYear + 1}`;
}

export function validateProgrammeAnchor(year: number | null | undefined, duration: number | null | undefined) {
  if (!Number.isInteger(year) || !year || year < 1) {
    return { severity: 'error' as const, message: 'Choose a valid current year of study.' };
  }
  if (!Number.isInteger(duration) || !duration || duration < 1 || duration > 6) {
    return { severity: 'error' as const, message: 'Enter a programme duration from 1 to 6 years.' };
  }
  const maximumStay = duration + 2;
  if (year > maximumStay) {
    return {
      severity: 'error' as const,
      message: `Year ${year} is beyond the maximum stay of ${maximumStay} years (programme duration plus 2 years).`,
    };
  }
  if (year > 6) {
    return { severity: 'error' as const, message: 'Choose your current year of study from 1 to 6.' };
  }
  if (year > duration) {
    return {
      severity: 'warning' as const,
      message: `Year ${year} is beyond the ${duration}-year programme duration. The maximum stay is ${maximumStay} years (programme duration plus 2 years).`,
    };
  }
  return { severity: null, message: null };
}

export function programmeRemaining(anchor: ProgrammeAnchor, today: string) {
  parseCalendarDate(today);
  const validation = validateProgrammeAnchor(anchor.year, anchor.programDurationYears);
  if (validation.severity === 'error' || !Number.isInteger(anchor.semester)
    || anchor.semester < 1 || anchor.semester > 2) {
    return {
      semestersDone: null,
      semestersLeft: null,
      finishDate: null,
      validationMessage: validation.message ?? 'Choose a semester from 1 to 2.',
      validationSeverity: validation.severity ?? 'error',
    };
  }

  const semestersDone = (anchor.year - 1) * 2 + (anchor.semester - 1);
  const semestersLeft = anchor.programDurationYears * 2 - semestersDone;
  const semesterTwo = calendarData.semesters.find((semester) => semester.number === 2);
  const anchorYear = /^(\d{4})\/\d{4}$/.exec(anchor.academicYear);
  const calendarYear = /^(\d{4})\/\d{4}$/.exec(calendarData.academicYear);
  if (!semesterTwo || !anchorYear || !calendarYear) {
    return {
      semestersDone,
      semestersLeft,
      finishDate: null,
      validationMessage: 'A finish-date estimate is not available for this academic year.',
      validationSeverity: 'warning' as const,
    };
  }

  const academicYearOffset = Number(anchorYear[1]) - Number(calendarYear[1])
    + anchor.programDurationYears - anchor.year;
  const finishDate = getLocalCalendarDate(addCalendarMonths(semesterTwo.end, academicYearOffset * 12));
  return {
    semestersDone,
    semestersLeft,
    finishDate,
    validationMessage: validation.message,
    validationSeverity: validation.severity,
  };
}

export function getCourseworkProgress(courses: CourseUnit[]) {
  const courseworkByCourse = courses.map((course) => ({
    course,
    assessments: course.assessments.filter((assessment) => /\bcoursework\b/i.test(assessment.name)),
  }));
  const assessments = courseworkByCourse.flatMap(({ assessments: courseAssessments }) => courseAssessments);
  return {
    completed: assessments.filter((assessment) => assessment.obtained !== null).length,
    total: assessments.length,
    coursesNeedingMarks: courseworkByCourse
      .filter(({ assessments: courseAssessments }) =>
        courseAssessments.length === 0 || courseAssessments.every((assessment) => assessment.obtained === null))
      .map(({ course }) => course),
  };
}

export function getMilestoneDaysRemaining(date: string, today: string): number {
  return getDaysUntilCalendarDate(date, parseCalendarDate(today));
}
