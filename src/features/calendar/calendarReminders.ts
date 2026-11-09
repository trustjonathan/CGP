import { parseCalendarDate } from '@/lib/academicCalendar';
import type { CalendarTimelineEvent } from './calendarTimeline';

const STORAGE_KEY = 'cgp-calendar-reminders-v1';

export interface CalendarReminderPreferences {
  enabledEventIds: string[];
  sentReminderIds: string[];
}

export interface ScheduledCalendarReminder {
  id: string;
  eventId: string;
  fireAt: Date;
  eventAt: Date;
  title: string;
  body: string;
  deepLink: string;
}

export const emptyCalendarReminderPreferences: CalendarReminderPreferences = {
  enabledEventIds: [],
  sentReminderIds: [],
};

export function getCalendarReminderId(eventId: string): string {
  return `${eventId}:1d`;
}

export function readCalendarReminderPreferences(): CalendarReminderPreferences {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return emptyCalendarReminderPreferences;

  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Saved calendar reminder preferences are invalid: ${detail}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Saved calendar reminder preferences have an invalid format.');
  }

  const preferences = parsed as Partial<CalendarReminderPreferences>;
  if (!Array.isArray(preferences.enabledEventIds) || !Array.isArray(preferences.sentReminderIds)
    || !preferences.enabledEventIds.every((id) => typeof id === 'string')
    || !preferences.sentReminderIds.every((id) => typeof id === 'string')) {
    throw new Error('Saved calendar reminder preferences have invalid entries.');
  }
  return {
    enabledEventIds: preferences.enabledEventIds,
    sentReminderIds: preferences.sentReminderIds,
  };
}

export function writeCalendarReminderPreferences(preferences: CalendarReminderPreferences): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new Event('cgp-calendar-reminders-updated'));
}

export function setCalendarReminderEnabled(eventId: string, enabled: boolean): CalendarReminderPreferences {
  const previous = readCalendarReminderPreferences();
  const reminderId = getCalendarReminderId(eventId);
  const enabledEventIds = enabled
    ? [...new Set([...previous.enabledEventIds, eventId])]
    : previous.enabledEventIds.filter((id) => id !== eventId);
  const sentReminderIds = enabled
    ? previous.sentReminderIds
    : previous.sentReminderIds.filter((id) => id !== reminderId);
  const next = { enabledEventIds, sentReminderIds };
  writeCalendarReminderPreferences(next);
  return next;
}

export function computeSchedule(
  events: CalendarTimelineEvent[],
  enabledEventIds: readonly string[],
  now: Date,
): ScheduledCalendarReminder[] {
  if (Number.isNaN(now.getTime())) throw new RangeError('The current date must be valid.');
  const enabled = new Set(enabledEventIds);

  return events
    .filter((event) => enabled.has(event.id))
    .map((event) => {
      const eventAt = parseCalendarDate(event.date);
      eventAt.setHours(8, 0, 0, 0);
      const fireAt = new Date(eventAt);
      fireAt.setDate(fireAt.getDate() - 1);
      return {
        id: getCalendarReminderId(event.id),
        eventId: event.id,
        fireAt,
        eventAt,
        title: event.label,
        body: `Starts ${new Intl.DateTimeFormat('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(eventAt)}.`,
        deepLink: `#/calendar?event=${encodeURIComponent(event.id)}`,
      };
    })
    .filter((reminder) => reminder.eventAt.getTime() > now.getTime())
    .sort((left, right) => left.fireAt.getTime() - right.fireAt.getTime());
}

export function markCalendarReminderSent(reminderId: string): boolean {
  const preferences = readCalendarReminderPreferences();
  if (preferences.sentReminderIds.includes(reminderId)) return false;
  writeCalendarReminderPreferences({
    ...preferences,
    sentReminderIds: [...preferences.sentReminderIds, reminderId],
  });
  return true;
}
