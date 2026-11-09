import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarDays, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import type { AcademicCalendarSemester } from '@/lib/academicCalendar';
import { getDaysUntilCalendarDate, parseCalendarDate } from '@/lib/academicCalendar';
import {
  eventEndDate,
  getTimelineBounds,
  getTimelineEventState,
  getTimelineEvents,
  getTimelinePosition,
  getTimelineWeekTicks,
  isTimelinePeriod,
  placeTimelineLabels,
  type CalendarTimelineEvent,
  type TimelineRange,
} from './calendarTimeline';
import {
  readCalendarReminderPreferences,
  setCalendarReminderEnabled,
} from './calendarReminders';

interface CalendarTimelineProps {
  semester: AcademicCalendarSemester;
  events: CalendarTimelineEvent[];
  today: string;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
    .format(parseCalendarDate(value));
}

function longDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseCalendarDate(value));
}

function eventLabel(event: CalendarTimelineEvent) {
  if (!isTimelinePeriod(event)) return event.label;
  const label = event.type === 'exam'
    ? 'Exams'
    : event.label.replace(/\s+starts$/i, '');
  const dateRange = event.endDate
    ? `${shortDate(event.date)} – ${shortDate(event.endDate)}`
    : shortDate(event.date);
  return `${label} · ${dateRange}`;
}

function eventStateClass(state: ReturnType<typeof getTimelineEventState>) {
  return `calendar-timeline-event--${state}`;
}

function daysLabel(days: number) {
  if (days === 0) return 'Today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

function todayRowIndex(events: CalendarTimelineEvent[], today: string) {
  const futureIndex = events.findIndex((event) => event.date > today);
  return futureIndex < 0 ? events.length : futureIndex;
}

export function CalendarTimeline({ semester, events, today }: CalendarTimelineProps) {
  const location = useLocation();
  const [range, setRange] = useState<TimelineRange>('semester');
  const [selectedEvent, setSelectedEvent] = useState<CalendarTimelineEvent | null>(null);
  const [reminderEventIds, setReminderEventIds] = useState<string[]>([]);
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderBusy, setReminderBusy] = useState(false);
  const desktopViewportRef = useRef<HTMLDivElement>(null);
  const mobileViewportRef = useRef<HTMLDivElement>(null);
  const timelineEvents = useMemo(() => getTimelineEvents(events, today, range), [events, range, today]);
  const bounds = useMemo(
    () => getTimelineBounds(semester.start, semester.end, timelineEvents, today, range),
    [range, semester.end, semester.start, timelineEvents, today],
  );
  const weekTicks = useMemo(
    () => getTimelineWeekTicks(semester.weekStart, bounds.startDate, bounds.totalDays, range, today),
    [bounds.startDate, bounds.totalDays, range, semester.weekStart, today],
  );
  const nextEventId = timelineEvents.find((event) => event.date > today)?.id ?? null;
  const trackWidth = 1100;
  const labels = useMemo(
    () => placeTimelineLabels(
      timelineEvents,
      trackWidth,
      (event) => getTimelinePosition(event.date, bounds.startDate, bounds.totalDays, today, range),
    ),
    [bounds.startDate, bounds.totalDays, range, today, timelineEvents],
  );
  const labelById = new Map(labels.map((label) => [label.eventId, label]));
  const trackHeight = Math.max(300, 240 + Math.ceil(Math.max(1, labels.length ? Math.max(...labels.map(({ lane }) => lane + 1)) : 1) / 2) * 38);
  const todayPosition = getTimelinePosition(today, bounds.startDate, bounds.totalDays, today, range);
  const rows = [...timelineEvents];
  const mobileTodayIndex = todayRowIndex(rows, today);
  const mobileTodayRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const refreshPreferences = () => {
      try {
        setReminderEventIds(readCalendarReminderPreferences().enabledEventIds);
        setReminderMessage('');
      } catch (error) {
        console.error('Unable to load calendar reminder preferences.', error);
        setReminderMessage('Reminder preferences could not be loaded on this device.');
      }
    };
    refreshPreferences();
    window.addEventListener('cgp-calendar-reminders-updated', refreshPreferences);
    window.addEventListener('storage', refreshPreferences);
    return () => {
      window.removeEventListener('cgp-calendar-reminders-updated', refreshPreferences);
      window.removeEventListener('storage', refreshPreferences);
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const desktop = desktopViewportRef.current;
      if (desktop && range === 'semester') {
        const position = (todayPosition / 100) * desktop.scrollWidth;
        desktop.scrollLeft = Math.max(0, position - desktop.clientWidth / 2);
      }
      const mobile = mobileViewportRef.current;
      const todayMarker = mobileTodayRef.current;
      if (mobile && todayMarker) {
        mobile.scrollTop = Math.max(0, todayMarker.offsetTop - mobile.clientHeight / 2);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [range, todayPosition, timelineEvents.length]);

  useEffect(() => {
    if (!selectedEvent) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedEvent(null);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedEvent]);

  useEffect(() => {
    const eventId = new URLSearchParams(location.search).get('event');
    if (!eventId) return;
    const event = events.find((item) => item.id === eventId);
    if (event) setSelectedEvent(event);
  }, [events, location.search]);

  const openEvent = (event: CalendarTimelineEvent) => setSelectedEvent(event);
  const toggleSelectedReminder = async () => {
    if (!selectedEvent) return;
    const enabled = reminderEventIds.includes(selectedEvent.id);
    setReminderBusy(true);
    setReminderMessage('');
    try {
      if (!enabled) {
        if (typeof Notification === 'undefined') {
          setReminderMessage('Notifications are not available in this app or browser.');
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setReminderMessage(permission === 'denied'
            ? 'Notifications are blocked. Allow them in your browser or device settings, then try again.'
            : 'Notifications were not enabled. You can turn them on later.');
          return;
        }
      }
      const preferences = setCalendarReminderEnabled(selectedEvent.id, !enabled);
      setReminderEventIds(preferences.enabledEventIds);
      setReminderMessage(!enabled
        ? 'Reminder set for 8:00 AM the day before. It will notify while CGP is open.'
        : 'Reminder turned off on this device.');
    } catch (error) {
      console.error('Unable to update this calendar reminder.', error);
      setReminderMessage('This reminder could not be saved on this device.');
    } finally {
      setReminderBusy(false);
    }
  };
  const selectedDaysRemaining = selectedEvent
    ? getDaysUntilCalendarDate(selectedEvent.date, parseCalendarDate(today))
    : null;

  return (
    <>
      <section
        className="rounded-2xl border border-ink-200 bg-white/90 p-4 shadow-sm dark:border-ink-700 dark:bg-ink-900/90 sm:p-5"
        aria-labelledby="semester-timeline-title"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="semester-timeline-title" className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
              Semester {semester.number} timeline
            </h2>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              {longDate(semester.start)} – {longDate(semester.end)}
            </p>
          </div>
          <div className="inline-flex w-fit rounded-xl border border-ink-200 bg-ink-50 p-1 dark:border-ink-700 dark:bg-ink-800" role="group" aria-label="Timeline range">
            <button
              type="button"
              onClick={() => setRange('semester')}
              aria-pressed={range === 'semester'}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${range === 'semester' ? 'bg-white text-primary-700 shadow-sm dark:bg-ink-700 dark:text-primary-200' : 'text-ink-600 dark:text-ink-300'}`}
            >
              Whole semester
            </button>
            <button
              type="button"
              onClick={() => setRange('next30Days')}
              aria-pressed={range === 'next30Days'}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${range === 'next30Days' ? 'bg-white text-primary-700 shadow-sm dark:bg-ink-700 dark:text-primary-200' : 'text-ink-600 dark:text-ink-300'}`}
            >
              Next 30 days
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-ink-600 dark:text-ink-300" aria-label="Timeline legend">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary-600" />Upcoming</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink-400" />Past</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-error-500" />Today</span>
        </div>

        <div
          ref={desktopViewportRef}
          className="calendar-timeline-desktop mt-2 overflow-x-auto overscroll-x-contain pb-2"
          role="region"
          aria-label="Scrollable semester timeline"
        >
          <div
            className="calendar-timeline-track relative"
            style={{ width: `${trackWidth}px`, minWidth: `${trackWidth}px`, height: `${trackHeight}px` }}
            aria-hidden="true"
          >
            <div className="calendar-timeline-axis" />
            {timelineEvents.filter(isTimelinePeriod).map((event) => {
              const start = getTimelinePosition(event.date, bounds.startDate, bounds.totalDays, today, range);
              const end = getTimelinePosition(eventEndDate(event), bounds.startDate, bounds.totalDays, today, range);
              const clippedLeft = Math.min(start, end);
              const width = Math.max(1, end - start);
              return (
                <button
                  type="button"
                  tabIndex={-1}
                  key={event.id}
                  className={`calendar-timeline-band ${eventStateClass(getTimelineEventState(event, today, nextEventId))}`}
                  style={{ left: `${clippedLeft}%`, width: `${width}%` }}
                  onClick={() => openEvent(event)}
                  aria-label={eventLabel(event)}
                >
                  <span>{event.type === 'exam' ? 'Exams' : event.label.replace(/\s+starts$/i, '')}</span>
                </button>
              );
            })}
            {timelineEvents.filter((event) => !isTimelinePeriod(event)).map((event) => {
              const placement = labelById.get(event.id);
              const position = getTimelinePosition(event.date, bounds.startDate, bounds.totalDays, today, range);
              return (
                <span
                  key={event.id}
                  className={`calendar-timeline-dot ${eventStateClass(getTimelineEventState(event, today, nextEventId))}`}
                  style={{ left: `${position}%` }}
                  onClick={() => openEvent(event)}
                  title={event.label}
                >
                  <span className="calendar-timeline-dot-hit" />
                  {placement && (
                    <span
                      className={`calendar-timeline-label calendar-timeline-label--${placement.align}`}
                      style={{
                        left: `${placement.left}px`,
                        width: `${placement.width}px`,
                        top: `${placement.lane % 2 === 0
                          ? 8 + Math.floor(placement.lane / 2) * 38
                          : 156 + Math.floor(placement.lane / 2) * 38}px`,
                      }}
                    >
                      {eventLabel(event)}
                      {event.id === nextEventId && (
                        <small className="calendar-timeline-next-badge">
                          {daysLabel(getDaysUntilCalendarDate(event.date, parseCalendarDate(today)))}
                        </small>
                      )}
                    </span>
                  )}
                </span>
              );
            })}
            {timelineEvents.filter(isTimelinePeriod).map((event) => {
              const placement = labelById.get(event.id);
              return placement ? (
                <span
                  key={`label-${event.id}`}
                  className={`calendar-timeline-period-label calendar-timeline-label--${placement.align}`}
                  style={{
                    left: `${placement.left}px`,
                    width: `${placement.width}px`,
                    top: `${placement.lane % 2 === 0
                      ? 8 + Math.floor(placement.lane / 2) * 38
                      : 156 + Math.floor(placement.lane / 2) * 38}px`,
                  }}
                  onClick={() => openEvent(event)}
                  title={eventLabel(event)}
                >
                  {eventLabel(event)}
                  {event.id === nextEventId && (
                    <small className="calendar-timeline-next-badge">
                      {daysLabel(getDaysUntilCalendarDate(event.date, parseCalendarDate(today)))}
                    </small>
                  )}
                </span>
              ) : null;
            })}
            {weekTicks.map((tick) => (
              <span
                key={tick.week}
                className="calendar-timeline-week"
                style={{ left: `${tick.position}%` }}
              >
                W{tick.week}
              </span>
            ))}
            <div className="calendar-timeline-today" style={{ left: `${todayPosition}%` }}>
              <span>Today</span>
            </div>
          </div>
        </div>

        <div
          ref={mobileViewportRef}
          className="calendar-timeline-mobile mt-4 max-h-[28rem] overflow-y-auto overscroll-contain"
          aria-hidden="true"
        >
          <ol className="calendar-timeline-mobile-list">
            {rows.map((event, index) => (
              <li key={event.id} className="calendar-timeline-mobile-item">
                {index === mobileTodayIndex && (
                  <li ref={mobileTodayRef} className="calendar-timeline-mobile-today">
                    <span className="calendar-timeline-mobile-today-dot" />
                    <span>Today · {longDate(today)}</span>
                  </li>
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => openEvent(event)}
                  className={`calendar-timeline-mobile-event ${eventStateClass(getTimelineEventState(event, today, nextEventId))} ${isTimelinePeriod(event) ? 'calendar-timeline-mobile-event--period' : ''}`}
                >
                  <span className="calendar-timeline-mobile-dot" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{eventLabel(event)}</span>
                    <span className="mt-0.5 block text-xs opacity-80">{longDate(event.date)}</span>
                  </span>
                  {event.id === nextEventId && (
                    <span className="calendar-timeline-days-badge">
                      {daysLabel(getDaysUntilCalendarDate(event.date, parseCalendarDate(today)))}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {mobileTodayIndex === rows.length && (
              <li className="calendar-timeline-mobile-today" ref={mobileTodayRef}>
                <span className="calendar-timeline-mobile-today-dot" />
                <span>Today · {longDate(today)}</span>
              </li>
            )}
          </ol>
        </div>

        {timelineEvents.length === 0 && (
          <p className="mt-4 rounded-xl bg-ink-50 p-4 text-sm text-ink-600 dark:bg-ink-800 dark:text-ink-300">
            No primary milestones fall within this range.
          </p>
        )}

        <ol className="calendar-visually-hidden">
          {events.map((event) => (
            <li key={event.id}>
              <button type="button" onClick={() => openEvent(event)}>
                {event.label}, {longDate(event.date)}
              </button>
            </li>
          ))}
        </ol>
      </section>

      {selectedEvent && selectedDaysRemaining !== null && (
        <div
          className="calendar-timeline-sheet-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedEvent(null);
          }}
        >
          <section
            className="calendar-timeline-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="timeline-sheet-title"
          >
            <div className="calendar-timeline-sheet-handle" aria-hidden="true" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  Semester {selectedEvent.semesterNumber ?? semester.number}
                </p>
                <h2 id="timeline-sheet-title" className="mt-2 font-display text-xl font-bold text-ink-900 dark:text-ink-50">
                  {selectedEvent.label}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"
                onClick={() => setSelectedEvent(null)}
                aria-label="Close milestone details"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-4 text-sm font-medium text-ink-700 dark:text-ink-200">
              {longDate(selectedEvent.date)}
              {selectedEvent.endDate && selectedEvent.endDate !== selectedEvent.date
                ? ` – ${longDate(selectedEvent.endDate)}`
                : ''}
            </p>
            <p className="mt-1 text-sm text-primary-700 dark:text-primary-300">
              {selectedDaysRemaining < 0
                ? `${Math.abs(selectedDaysRemaining)} day${Math.abs(selectedDaysRemaining) === 1 ? '' : 's'} ago`
                : daysLabel(selectedDaysRemaining)}
            </p>
            {selectedEvent.note && (
              <p className="mt-4 rounded-xl bg-ink-50 p-3 text-sm leading-6 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                {selectedEvent.note}
              </p>
            )}
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-ink-200 pt-4 dark:border-ink-700">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-ink-200">
                <Bell className="h-4 w-4" aria-hidden="true" />
                Remind me
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={reminderEventIds.includes(selectedEvent.id)}
                disabled={reminderBusy}
                onClick={() => void toggleSelectedReminder()}
                className={`calendar-timeline-reminder-switch ${reminderEventIds.includes(selectedEvent.id) ? 'calendar-timeline-reminder-switch--on' : ''}`}
                aria-label={`Remind me about ${selectedEvent.label}`}
              >
                <span />
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-500 dark:text-ink-400" role="status">
              {reminderMessage || 'Reminder time: 8:00 AM the day before. Notifications require permission.'}
            </p>
          </section>
        </div>
      )}
    </>
  );
}
