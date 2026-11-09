import { describe, expect, it } from 'vitest';
import { computeSchedule, getCalendarReminderId } from './calendarReminders';
import type { CalendarTimelineEvent } from './calendarTimeline';

const exam: CalendarTimelineEvent = {
  id: 's1-exams',
  label: 'Semester exams',
  date: '2026-11-27',
  endDate: '2026-12-11',
  type: 'exam',
  semesterNumber: 1,
  priority: 'primary',
};

describe('calendar reminders', () => {
  it('schedules a date-only milestone for 8 AM local time the day before', () => {
    const [reminder] = computeSchedule(
      [exam],
      ['s1-exams'],
      new Date(2026, 10, 9, 20, 0, 0),
    );

    expect(reminder).toMatchObject({
      id: 's1-exams:1d',
      eventId: 's1-exams',
      title: 'Semester exams',
      deepLink: '#/calendar?event=s1-exams',
    });
    expect(reminder.fireAt).toEqual(new Date(2026, 10, 26, 8, 0, 0));
    expect(reminder.eventAt).toEqual(new Date(2026, 10, 27, 8, 0, 0));
  });

  it('uses stable reminder ids and skips disabled or passed milestones', () => {
    expect(getCalendarReminderId('s1-exams')).toBe('s1-exams:1d');
    expect(computeSchedule(
      [exam],
      [],
      new Date(2026, 10, 9, 20, 0, 0),
    )).toEqual([]);
    expect(computeSchedule(
      [exam],
      ['s1-exams'],
      new Date(2026, 11, 12, 8, 0, 0),
    )).toEqual([]);
  });
});
