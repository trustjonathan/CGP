import { addMonths } from 'date-fns/addMonths';
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays';
import { intervalToDuration } from 'date-fns/intervalToDuration';
import { parseISO } from 'date-fns/parseISO';
import { startOfDay } from 'date-fns/startOfDay';

export type CalendarMilestoneType =
  | 'admin'
  | 'teaching'
  | 'coursework'
  | 'deadline'
  | 'exam'
  | 'break'
  | 'results';

export interface CalendarMilestone {
  id: string;
  label: string;
  date: string;
  endDate?: string;
  type: CalendarMilestoneType;
  note?: string;
}

export interface AcademicCalendarSemester {
  number: number;
  start: string;
  end: string;
  weekStart: string;
  milestones: CalendarMilestone[];
}

export interface AcademicCalendar {
  university: string;
  academicYear: string;
  audience: string;
  source: string;
  lastVerified: string;
  notes: string[];
  semesters: AcademicCalendarSemester[];
  publicHolidays: string[];
  ceremonies: Array<{ label: string; date: string }>;
}

export function parseCalendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new RangeError(`Expected a calendar date in YYYY-MM-DD format; received "${value}".`);
  }

  const date = parseISO(value);
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== Number(match[1])
    || date.getMonth() + 1 !== Number(match[2])
    || date.getDate() !== Number(match[3])
  ) {
    throw new RangeError(`Invalid calendar date "${value}".`);
  }
  return startOfDay(date);
}

export function getDaysUntilCalendarDate(value: string, today = new Date()): number {
  if (Number.isNaN(today.getTime())) {
    throw new RangeError('The reference date must be valid.');
  }
  return differenceInCalendarDays(parseCalendarDate(value), startOfDay(today));
}

export function getCalendarWeekNumber(date: string, weekStart: string): number {
  return Math.floor(
    differenceInCalendarDays(parseCalendarDate(date), parseCalendarDate(weekStart)) / 7,
  );
}

export function getCalendarIntervalDuration(start: string, end: string) {
  const intervalStart = parseCalendarDate(start);
  const intervalEnd = parseCalendarDate(end);
  if (differenceInCalendarDays(intervalEnd, intervalStart) < 0) {
    throw new RangeError('The interval end must not be before its start.');
  }
  return intervalToDuration({ start: intervalStart, end: intervalEnd });
}

export function addCalendarMonths(value: string, months: number): Date {
  if (!Number.isInteger(months)) {
    throw new RangeError('The number of months must be an integer.');
  }
  return startOfDay(addMonths(parseCalendarDate(value), months));
}
