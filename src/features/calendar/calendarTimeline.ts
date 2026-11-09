import { addDays } from 'date-fns/addDays';
import type { CalendarMilestoneType } from '@/lib/academicCalendar';
import { getCalendarWeekNumber, getDaysUntilCalendarDate, parseCalendarDate } from '@/lib/academicCalendar';

export type TimelineEventType = CalendarMilestoneType | 'ceremony';
export type MilestonePriority = 'primary' | 'secondary';
export type TimelineRange = 'semester' | 'next30Days';

export interface CalendarTimelineEvent {
  id: string;
  label: string;
  date: string;
  endDate?: string;
  type: TimelineEventType;
  note?: string;
  semesterNumber: number | null;
  priority: MilestonePriority;
}

export interface TimelineLabelPlacement {
  eventId: string;
  lane: number;
  align: 'left' | 'center' | 'right';
  left: number;
  width: number;
}

const priorityByType: Record<TimelineEventType, MilestonePriority> = {
  admin: 'secondary',
  teaching: 'primary',
  coursework: 'primary',
  deadline: 'primary',
  exam: 'primary',
  break: 'primary',
  results: 'primary',
  ceremony: 'secondary',
};

export function getMilestonePriority(type: TimelineEventType): MilestonePriority {
  return priorityByType[type];
}

export function isTimelinePeriod(event: CalendarTimelineEvent): boolean {
  return event.type === 'exam' || event.type === 'break';
}

export function eventEndDate(event: CalendarTimelineEvent): string {
  return event.endDate ?? event.date;
}

export function getTimelineEvents(
  events: CalendarTimelineEvent[],
  today: string,
  range: TimelineRange,
): CalendarTimelineEvent[] {
  parseCalendarDate(today);
  const todayDate = parseCalendarDate(today);
  const rangeEndDate = addDays(todayDate, 30);

  return events
    .filter((event) => event.priority === 'primary')
    .filter((event) => {
      if (range === 'semester') return true;
      const eventStart = parseCalendarDate(event.date);
      const eventEnd = parseCalendarDate(eventEndDate(event));
      return eventStart <= rangeEndDate && eventEnd >= todayDate;
    })
    .sort((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label));
}

export function getTimelineBounds(
  semesterStart: string,
  semesterEnd: string,
  events: CalendarTimelineEvent[],
  today: string,
  range: TimelineRange,
) {
  if (range === 'next30Days') return { startDate: today, totalDays: 30 };

  const lastDate = events.reduce((latest, event) => {
    const candidate = eventEndDate(event);
    return candidate > latest ? candidate : latest;
  }, semesterEnd);
  const totalDays = Math.max(
    1,
    getDaysUntilCalendarDate(lastDate, parseCalendarDate(semesterStart)),
  );
  return { startDate: semesterStart, totalDays };
}

export function getTimelinePosition(
  date: string,
  startDate: string,
  totalDays: number,
  today: string,
  range: TimelineRange,
): number {
  const referenceDate = parseCalendarDate(range === 'next30Days' ? today : startDate);
  const dayOffset = getDaysUntilCalendarDate(date, referenceDate);
  return Math.max(0, Math.min(100, (dayOffset / totalDays) * 100));
}

export function getTimelineWeekTicks(
  weekStart: string,
  startDate: string,
  totalDays: number,
  range: TimelineRange,
  today: string,
): Array<{ week: number; position: number }> {
  const referenceDate = range === 'next30Days' ? today : startDate;
  const offsetFromWeekStart = getDaysUntilCalendarDate(referenceDate, parseCalendarDate(weekStart));
  const firstWeek = Math.max(0, Math.floor(offsetFromWeekStart / 7));
  const lastWeek = Math.floor((offsetFromWeekStart + totalDays) / 7);
  const ticks: Array<{ week: number; position: number }> = [];

  for (let week = firstWeek; week <= lastWeek; week += 1) {
    const dayOffset = week * 7 - offsetFromWeekStart;
    if (dayOffset < 0 || dayOffset > totalDays) continue;
    if (week === firstWeek && dayOffset === 0) continue;
    ticks.push({ week, position: (dayOffset / totalDays) * 100 });
  }

  return ticks;
}

export function getTimelineEventState(
  event: CalendarTimelineEvent,
  today: string,
  nextEventId: string | null,
): 'past' | 'next' | 'today' | 'upcoming' {
  const daysUntilStart = getDaysUntilCalendarDate(event.date, parseCalendarDate(today));
  const daysUntilEnd = getDaysUntilCalendarDate(eventEndDate(event), parseCalendarDate(today));
  if (daysUntilEnd < 0) return 'past';
  if (daysUntilStart <= 0 && daysUntilEnd >= 0) return 'today';
  if (event.id === nextEventId) return 'next';
  return 'upcoming';
}

export function placeTimelineLabels(
  events: CalendarTimelineEvent[],
  trackWidth: number,
  positionForEvent: (event: CalendarTimelineEvent) => number,
): TimelineLabelPlacement[] {
  const sortedEvents = [...events].sort((left, right) => left.date.localeCompare(right.date));
  const laneEnds: number[] = [];

  return sortedEvents.map((event) => {
    const positionPercent = positionForEvent(event);
    const width = Math.min(220, Math.max(148, event.label.length * 6.8 + 56));
    const pixelPosition = (positionPercent / 100) * trackWidth;
    const centeredLeft = pixelPosition - width / 2;

    let lane = 0;
    while (lane < laneEnds.length && centeredLeft < laneEnds[lane] - 12) {
      lane += 1;
    }

    const left = Math.max(12, Math.min(trackWidth - width - 12, centeredLeft));
    laneEnds[lane] = left + width;

    let align: TimelineLabelPlacement['align'] = 'center';
    if (left <= 18) align = 'left';
    else if (left + width >= trackWidth - 18) align = 'right';

    return {
      eventId: event.id,
      lane,
      align,
      left,
      width,
    };
  });
}

export function getCalendarWeekLabel(date: string, weekStart: string): string {
  return `W${getCalendarWeekNumber(date, weekStart)}`;
}
