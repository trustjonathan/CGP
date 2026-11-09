import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays';
import { intervalToDuration } from 'date-fns/intervalToDuration';
import calendarDataJson from '@/data/calendars/kabale-2026-2027.json';
import type { AcademicCalendar } from '@/lib/academicCalendar';
import { addCalendarMonths, getDaysUntilCalendarDate, parseCalendarDate } from '@/lib/academicCalendar';
import type { CourseUnit, ProgrammeAnchor } from '@/lib/types';
import { getMilestonePriority, type CalendarTimelineEvent, type TimelineEventType } from './calendarTimeline';

const calendarData = calendarDataJson as AcademicCalendar;

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
  const milestones: CalendarTimelineEvent[] = calendarData.semesters.flatMap((semester) => semester.milestones.map((milestone) => ({
    ...milestone,
    type: milestone.type as TimelineEventType,
    semesterNumber: semester.number,
    priority: getMilestonePriority(milestone.type as TimelineEventType),
  })));
  const ceremonies: CalendarTimelineEvent[] = calendarData.ceremonies.map((ceremony, index) => ({
    id: `ceremony-${index}`,
    label: ceremony.label,
    date: ceremony.date,
    type: 'ceremony' as const,
    semesterNumber: calendarData.semesters.find((semester) =>
      ceremony.date >= semester.start && ceremony.date <= semester.end)?.number ?? null,
    priority: getMilestonePriority('ceremony'),
  }));
  return [...milestones, ...ceremonies]
    .filter((milestone) => milestone.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label))
    .slice(0, limit);
}

export function getSemesterCalendarEvents(semesterNumber: number) {
  const semester = calendarData.semesters.find((item) => item.number === semesterNumber);
  if (!semester) return [];
  const milestones: CalendarTimelineEvent[] = semester.milestones.map((milestone) => ({
    ...milestone,
    type: milestone.type as TimelineEventType,
    semesterNumber,
    priority: getMilestonePriority(milestone.type as TimelineEventType),
  }));
  const ceremonies: CalendarTimelineEvent[] = calendarData.ceremonies
    .filter((ceremony) => ceremony.date >= semester.start && ceremony.date <= semester.end)
    .map((ceremony, index) => ({
      id: `ceremony-${index}`,
      label: ceremony.label,
      date: ceremony.date,
      type: 'ceremony' as const,
      semesterNumber,
      priority: getMilestonePriority('ceremony'),
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
    assessments: course.assessments.filter((assessment) =>
      !/\b(exam|final)\b/i.test(assessment.name)),
  }));
  const assessments = courseworkByCourse.flatMap(({ assessments: courseAssessments }) =>
    courseAssessments.filter((assessment) => !/\bcurrent result\b/i.test(assessment.name)));
  return {
    completed: assessments.filter((assessment) => assessment.obtained !== null).length,
    total: assessments.length,
    coursesNeedingMarks: courseworkByCourse
      .filter(({ assessments: courseAssessments }) => {
        const tasks = courseAssessments.filter((assessment) => !/\bcurrent result\b/i.test(assessment.name));
        return tasks.length === 0
          ? courseAssessments.length === 0
          : tasks.every((assessment) => assessment.obtained === null);
      })
      .map(({ course }) => course),
  };
}

export function formatCountdown(target: string | Date, now: string | Date): string {
  const targetDate = typeof target === 'string'
    ? new Date(
      parseCalendarDate(target).getFullYear(),
      parseCalendarDate(target).getMonth(),
      parseCalendarDate(target).getDate(),
      8,
      0,
      0,
    )
    : new Date(target.getTime());
  const nowDate = typeof now === 'string' ? parseCalendarDate(now) : new Date(now.getTime());
  const totalMilliseconds = targetDate.getTime() - nowDate.getTime();

  if (totalMilliseconds <= 0) {
    return '0d 0h';
  }

  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const dayDifference = differenceInCalendarDays(targetDate, nowDate);

  if (dayDifference < 1) {
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  if (dayDifference === 1) {
    const remainingHours = Math.floor((totalMilliseconds / 3600000) % 24);
    return `${dayDifference}d ${remainingHours}h`;
  }

  if (dayDifference >= 2 && dayDifference <= 7) {
    const remainingHours = Math.floor((totalMilliseconds / 3600000) % 24);
    return `${dayDifference}d ${remainingHours}h`;
  }

  if (dayDifference >= 8 && dayDifference <= 60) {
    return `${dayDifference} days`;
  }

  const interval = intervalToDuration({ start: nowDate, end: targetDate });
  const months = interval.months ?? 0;
  const days = interval.days ?? 0;
  if (months > 0) {
    return days > 0 ? `${months} months, ${days} days` : `${months} months`;
  }

  return `${dayDifference} days`;
}

export function getMilestoneDaysRemaining(date: string, today: string): number {
  return getDaysUntilCalendarDate(date, parseCalendarDate(today));
}
