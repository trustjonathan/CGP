import { useEffect } from 'react';
import { getLocalCalendarDate, getUpcomingCalendarMilestones } from './calendarModel';
import {
  computeSchedule,
  markCalendarReminderSent,
  readCalendarReminderPreferences,
  type CalendarReminderPreferences,
} from './calendarReminders';

export function CalendarReminderScheduler() {
  useEffect(() => {
    let preferences: CalendarReminderPreferences = { enabledEventIds: [], sentReminderIds: [] };

    const refreshPreferences = () => {
      try {
        preferences = readCalendarReminderPreferences();
      } catch (error) {
        console.error('Unable to refresh calendar reminder preferences.', error);
      }
    };
    const sendDueReminders = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const now = new Date();
      const events = getUpcomingCalendarMilestones(getLocalCalendarDate(now), 100);
      const dueReminders = computeSchedule(events, preferences.enabledEventIds, now)
        .filter((reminder) => reminder.fireAt.getTime() <= now.getTime());

      dueReminders.forEach((reminder) => {
        try {
          if (!markCalendarReminderSent(reminder.id)) return;
          const notification = new Notification(reminder.title, {
            body: reminder.body,
            tag: reminder.id,
          });
          notification.onclick = () => {
            window.focus();
            window.location.hash = reminder.deepLink.slice(1);
          };
        } catch (error) {
          console.error('Unable to send a calendar reminder notification.', error);
        }
      });
    };
    const onVisibilityChange = () => {
      if (!document.hidden) sendDueReminders();
    };
    const interval = window.setInterval(sendDueReminders, 30_000);
    window.addEventListener('cgp-calendar-reminders-updated', refreshPreferences);
    window.addEventListener('storage', refreshPreferences);
    document.addEventListener('visibilitychange', onVisibilityChange);
    refreshPreferences();
    sendDueReminders();

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('cgp-calendar-reminders-updated', refreshPreferences);
      window.removeEventListener('storage', refreshPreferences);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
