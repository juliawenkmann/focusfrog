// Entries from the Mac's calendars, shown read-only in Time blocking. FocusFrog Calendar
// (native/calendar) reads them and hands them to FocusFrog's server on the Mac; pages ask
// that server for them. They are never saved with the blocks and never synced.
import moment from 'moment';
import { DAY_MINUTES } from '~/util/calendarBlocks';

export type CalendarStatus = 'granted' | 'denied' | 'waiting';

export interface CalendarInfo {
  id: string;
  title: string;
  color: string;
  source: string;
}

export interface CalendarEntry {
  id: string;
  calendarId: string;
  title: string;
  location: string;
  // Timed: ISO times. All day: the first day and the day after the last (local dates).
  start: string;
  end: string;
  allDay: boolean;
  // False for entries marked "free".
  busy: boolean;
}

export interface CalendarFeed {
  status: CalendarStatus;
  from: string;
  to: string;
  calendars: CalendarInfo[];
  events: CalendarEntry[];
}

// The part of a timed entry on one day; one over midnight has a part on each day.
export interface CalendarOccurrence {
  key: string;
  entry: CalendarEntry;
  date: string;
  startMinute: number;
  endMinute: number;
}

const DATE_FORMAT = 'YYYY-MM-DD';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// An entry with no length still gets a sliver on the calendar.
const MIN_MINUTES = 15;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function normalizeEntry(value: unknown): CalendarEntry | null {
  const entry = value as Partial<CalendarEntry> | null;
  if (!entry || typeof entry !== 'object' || !text(entry.id)) return null;
  const allDay = entry.allDay === true;
  const start = text(entry.start);
  const end = text(entry.end);
  const valid = allDay
    ? DATE_PATTERN.test(start) && DATE_PATTERN.test(end) && start < end
    : moment(start, moment.ISO_8601, true).isValid() &&
      moment(end, moment.ISO_8601, true).isValid();
  if (!valid) return null;
  return {
    id: text(entry.id),
    calendarId: text(entry.calendarId),
    title: text(entry.title),
    location: text(entry.location),
    start,
    end,
    allDay,
    busy: entry.busy !== false,
  };
}

// What the server answered, read safely.
export function normalizeCalendarFeed(value: unknown): CalendarFeed {
  const feed = value as Partial<CalendarFeed> | null;
  const access: CalendarStatus =
    feed?.status === 'granted' || feed?.status === 'denied' ? feed.status : 'waiting';
  const calendars = (Array.isArray(feed?.calendars) ? feed.calendars : [])
    .filter(calendar => calendar && typeof calendar.id === 'string' && calendar.id)
    .map(calendar => ({
      id: calendar.id,
      title: text(calendar.title) || 'Calendar',
      color: /^#[0-9a-f]{6}$/i.test(text(calendar.color)) ? calendar.color : '#64748b',
      source: text(calendar.source),
    }));
  const events = (Array.isArray(feed?.events) ? feed.events : [])
    .map(normalizeEntry)
    .filter((entry): entry is CalendarEntry => entry !== null);
  return {
    status: access,
    from: DATE_PATTERN.test(text(feed?.from)) ? text(feed?.from) : '',
    to: DATE_PATTERN.test(text(feed?.to)) ? text(feed?.to) : '',
    calendars,
    events,
  };
}

const wallMinute = (time: moment.Moment) => time.hours() * 60 + time.minutes();

// The parts of the timed entries on each of `dates`, in this device's time zone.
export function timedCalendarOccurrences(
  entries: CalendarEntry[],
  dates: string[]
): CalendarOccurrence[] {
  const occurrences: CalendarOccurrence[] = [];
  entries.forEach(entry => {
    if (entry.allDay) return;
    const start = moment(entry.start);
    const end = moment.max(start, moment(entry.end));
    const firstDate = start.format(DATE_FORMAT);
    // An entry ending exactly at midnight belongs to the day before.
    const lastDate = (end.isAfter(start) ? end.clone().subtract(1, 'minute') : end).format(
      DATE_FORMAT
    );
    dates.forEach(date => {
      if (date < firstDate || date > lastDate) return;
      const startMinute = date === firstDate ? wallMinute(start) : 0;
      const endMinute = date === end.format(DATE_FORMAT) ? wallMinute(end) : DAY_MINUTES;
      occurrences.push({
        key: `${entry.id}:${date}`,
        entry,
        date,
        startMinute: Math.min(startMinute, DAY_MINUTES - MIN_MINUTES),
        endMinute: Math.min(DAY_MINUTES, Math.max(endMinute, startMinute + MIN_MINUTES)),
      });
    });
  });
  return occurrences;
}

// The all-day entries on `date`.
export function allDayEntriesOn(entries: CalendarEntry[], date: string): CalendarEntry[] {
  return entries
    .filter(entry => entry.allDay && entry.start <= date && date < entry.end)
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

// "09:00–10:30", or with the day when the entry starts or ends on another day.
export function calendarTimeLabel(entry: CalendarEntry, date: string): string {
  if (entry.allDay) return 'All day';
  const start = moment(entry.start);
  const end = moment(entry.end);
  const label = (time: moment.Moment) =>
    time.format(DATE_FORMAT) === date ? time.format('HH:mm') : time.format('ddd HH:mm');
  return `${label(start)}–${label(end)}`;
}
