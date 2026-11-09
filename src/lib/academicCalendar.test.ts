import { describe, expect, it } from 'vitest';
import calendarData from '../data/calendars/kabale-2026-2027.json';
import {
  addCalendarMonths,
  getCalendarIntervalDuration,
  getCalendarWeekNumber,
  getDaysUntilCalendarDate,
  parseCalendarDate,
} from './academicCalendar';

const calendar = calendarData;

describe('academic calendar date helpers', () => {
  it('parses date-only values as local calendar dates', () => {
    const date = parseCalendarDate('2026-11-27');

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(10);
    expect(date.getDate()).toBe(27);
    expect(date.getHours()).toBe(0);
  });

  it('rejects invalid date-only values', () => {
    expect(() => parseCalendarDate('2026-02-29')).toThrow(RangeError);
    expect(() => parseCalendarDate('2026-2-09')).toThrow(RangeError);
  });

  it('calculates calendar-day countdowns independent of time of day', () => {
    const today = new Date(2026, 10, 9, 23, 45);

    expect(getDaysUntilCalendarDate('2026-11-27', today)).toBe(18);
    expect(getDaysUntilCalendarDate('2026-11-09', today)).toBe(0);
    expect(getDaysUntilCalendarDate('2026-11-08', today)).toBe(-1);
  });

  it('numbers semester weeks from week 0 at weekStart', () => {
    expect(getCalendarWeekNumber('2026-08-03', '2026-08-03')).toBe(0);
    expect(getCalendarWeekNumber('2026-08-09', '2026-08-03')).toBe(0);
    expect(getCalendarWeekNumber('2026-08-10', '2026-08-03')).toBe(1);
    expect(getCalendarWeekNumber('2026-08-17', '2026-08-03')).toBe(2);
  });

  it('returns calendar interval duration and handles month-end arithmetic', () => {
    expect(getCalendarIntervalDuration('2026-08-03', '2026-12-18')).toMatchObject({
      months: 4,
      days: 15,
    });

    const date = addCalendarMonths('2027-01-31', 1);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2027, 1, 28]);
  });

  it('contains valid date-only fields throughout the supplied calendar', () => {
    for (const semester of calendar.semesters) {
      parseCalendarDate(semester.start);
      parseCalendarDate(semester.end);
      parseCalendarDate(semester.weekStart);
      for (const milestone of semester.milestones) {
        parseCalendarDate(milestone.date);
        if (milestone.endDate) parseCalendarDate(milestone.endDate);
      }
    }
    for (const holiday of calendar.publicHolidays) parseCalendarDate(holiday);
    for (const ceremony of calendar.ceremonies) parseCalendarDate(ceremony.date);
  });
});
