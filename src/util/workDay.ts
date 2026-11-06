// Work sums for a set of time periods: tracked events plus manual work and the daily
// meeting credit. Shared by the Hours page and the uploader that sends daily sums to
// the phone, so both always show the same numbers.
import moment from 'moment';
import {
  categorizeFocusFrogEvent,
  categoryKey,
  isNotWorkCategory,
  MESSAGE_CALLS_CATEGORY,
} from '~/util/focusfrogCategories';
import { get_offset_duration, get_today_with_offset } from '~/util/time';
import type { CategoryDuration, WorkCategorySummary } from '~/util/workReport';
import { addAfkGraceToActiveEvents, sumEventDurations } from '~/util/workReport';

export interface ManualWorkEntry {
  id: string;
  date: string;
  startTime: string;
  minutes: number;
  category: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

export const MANUAL_WORK_SERVER_KEY = 'manualWork';
export const DAILY_MEETING_WORK_CATEGORY = ['Work', 'Meetings'];

export const MANUAL_WORK_CATEGORY_OPTIONS = [
  { category: DAILY_MEETING_WORK_CATEGORY, text: 'Meetings' },
  { category: ['Work', 'Planning'], text: 'Planning' },
  { category: ['Work', 'Writing'], text: 'Writing' },
  { category: ['Work', 'Programming'], text: 'Programming' },
  { category: ['Work', 'Email'], text: 'Email' },
  { category: ['Work', MESSAGE_CALLS_CATEGORY], text: MESSAGE_CALLS_CATEGORY },
  { category: ['Work', 'AI Chats'], text: 'AI Chats' },
  { category: ['Work', 'Manual time'], text: 'Manual time' },
  { category: ['Work'], text: 'Uncategorized work' },
].map(option => ({ ...option, value: categoryKey(option.category) }));

// A stored category: a list starting with 'Work', an option key, or that key as JSON.
export function normalizeManualWorkCategory(value: unknown): string[] {
  if (Array.isArray(value)) {
    const category = value.filter(item => typeof item === 'string') as string[];
    if (category.length > 0 && category[0] === 'Work') return [...category];
  }
  if (typeof value === 'string' && value) {
    const matchingOption = MANUAL_WORK_CATEGORY_OPTIONS.find(option => option.value === value);
    if (matchingOption) return [...matchingOption.category];
    try {
      return normalizeManualWorkCategory(JSON.parse(value));
    } catch {
      return [...DAILY_MEETING_WORK_CATEGORY];
    }
  }
  return [...DAILY_MEETING_WORK_CATEGORY];
}

export function normalizeManualWorkEntry(entry: any): ManualWorkEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const date = typeof entry.date === 'string' ? entry.date : '';
  if (!moment(date, 'YYYY-MM-DD', true).isValid()) return null;
  const minutes = Math.max(0, Math.round(Number(entry.minutes || 0)));
  if (minutes <= 0) return null;
  const now = moment().toISOString();
  return {
    id:
      typeof entry.id === 'string' && entry.id
        ? entry.id
        : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    startTime:
      typeof entry.startTime === 'string' && /^\d{2}:\d{2}$/.test(entry.startTime)
        ? entry.startTime
        : '',
    minutes,
    category: normalizeManualWorkCategory(entry.category || entry.categoryKey),
    note: typeof entry.note === 'string' ? entry.note : '',
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : now,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : now,
  };
}

export function normalizeManualWorkEntries(value: unknown): ManualWorkEntry[] {
  return (Array.isArray(value) ? value : [])
    .map(normalizeManualWorkEntry)
    .filter((entry): entry is ManualWorkEntry => Boolean(entry));
}

export function manualWorkEntryStart(entry: ManualWorkEntry): moment.Moment {
  const start = moment(`${entry.date} ${entry.startTime || '12:00'}`, 'YYYY-MM-DD HH:mm', true);
  return start.isValid() ? start : moment(entry.date, 'YYYY-MM-DD').startOf('day');
}

export function manualWorkSecondsInRange(
  entry: ManualWorkEntry,
  rangeStart: moment.Moment,
  rangeEnd: moment.Moment
): number {
  if (!rangeStart.isValid() || !rangeEnd.isValid() || !rangeEnd.isAfter(rangeStart)) return 0;
  if (!entry.startTime) {
    const entryDay = moment(entry.date, 'YYYY-MM-DD');
    if (!entryDay.isValid()) return 0;
    return entryDay.isSameOrAfter(rangeStart.clone().startOf('day')) &&
      entryDay.isSameOrBefore(rangeEnd.clone().subtract(1, 'millisecond').startOf('day'))
      ? entry.minutes * 60
      : 0;
  }
  const entryStart = manualWorkEntryStart(entry);
  const entryEnd = entryStart.clone().add(entry.minutes, 'minutes');
  const clippedStart = moment.max(entryStart, rangeStart);
  const clippedEnd = moment.min(entryEnd, rangeEnd);
  return Math.max(0, clippedEnd.diff(clippedStart, 'seconds', true));
}

export function manualWorkSecondsInTimeperiods(
  entry: ManualWorkEntry,
  timeperiods: string[]
): number {
  return timeperiods.reduce((total, timeperiod) => {
    const [startIso, endIso] = timeperiod.split('/');
    return total + manualWorkSecondsInRange(entry, moment(startIso), moment(endIso));
  }, 0);
}

export function dailyMeetingEntry(date: string): ManualWorkEntry {
  return {
    id: `daily-meeting-credit-${date}`,
    date,
    startTime: '12:00',
    minutes: 60,
    category: [...DAILY_MEETING_WORK_CATEGORY],
    note: 'Meetings',
    createdAt: date,
    updatedAt: date,
  };
}

// Whether a date is a Feiertag or holiday (see util/timeOff.ts).
export type IsFreeDay = (date: string) => boolean;
const NO_FREE_DAYS: IsFreeDay = () => false;

// One meeting credit for every day the periods touch, up to today, except free days.
export function dailyMeetingEntriesForTimeperiods(
  timeperiods: string[],
  todayKey: string,
  isFreeDay: IsFreeDay = NO_FREE_DAYS
): ManualWorkEntry[] {
  const dates = new Set<string>();
  timeperiods.forEach(timeperiod => {
    const start = moment(timeperiod.split('/')[0]);
    const dateKey = start.format('YYYY-MM-DD');
    if (start.isValid() && dateKey <= todayKey && !isFreeDay(dateKey)) dates.add(dateKey);
  });
  return Array.from(dates).sort().map(dailyMeetingEntry);
}

export const sumManualWorkSeconds = (entries: ManualWorkEntry[], timeperiods: string[]) =>
  entries.reduce((total, entry) => total + manualWorkSecondsInTimeperiods(entry, timeperiods), 0);

export const sumMeetingSeconds = (
  timeperiods: string[],
  todayKey: string,
  isFreeDay: IsFreeDay = NO_FREE_DAYS
) =>
  sumManualWorkSeconds(
    dailyMeetingEntriesForTimeperiods(timeperiods, todayKey, isFreeDay),
    timeperiods
  );

export function addCategoryDuration(
  categoryDurations: CategoryDuration[],
  category: string[],
  seconds: number
): CategoryDuration[] {
  if (seconds <= 0) return categoryDurations;
  const key = categoryKey(category);
  const categoryMap: Record<string, CategoryDuration> = {};
  categoryDurations.forEach(row => {
    categoryMap[categoryKey(row.category)] = { category: row.category, duration: row.duration };
  });
  categoryMap[key] = categoryMap[key] || { category, duration: 0 };
  categoryMap[key].duration += seconds;
  return Object.values(categoryMap).sort((a, b) => b.duration - a.duration);
}

// Adds manual work and the daily meeting credit to tracked sums.
export function applyManualWork(
  summary: WorkCategorySummary,
  entries: ManualWorkEntry[],
  timeperiods: string[],
  todayKey: string,
  isFreeDay: IsFreeDay = NO_FREE_DAYS
): WorkCategorySummary {
  const rows: [string[], number][] = [
    ...entries.map(
      entry =>
        [
          normalizeManualWorkCategory(entry.category),
          manualWorkSecondsInTimeperiods(entry, timeperiods),
        ] as [string[], number]
    ),
    [DAILY_MEETING_WORK_CATEGORY, sumMeetingSeconds(timeperiods, todayKey, isFreeDay)],
  ];
  const extraWorkSeconds = rows.reduce((total, [, seconds]) => total + seconds, 0);
  if (extraWorkSeconds <= 0) return summary;
  return {
    ...summary,
    activeDuration: summary.activeDuration + extraWorkSeconds,
    workDuration: summary.workDuration + extraWorkSeconds,
    categoryDurations: rows.reduce(
      (durations, [category, seconds]) => addCategoryDuration(durations, category, seconds),
      summary.categoryDurations
    ),
  };
}

// Tracked sums from active events: every category, and what counts as not work.
export function summarizeActiveEvents(
  events: any[],
  activeDuration: number,
  categoryRules: any[]
): WorkCategorySummary {
  const categoryMap: Record<string, CategoryDuration> = {};
  let notWorkDuration = 0;
  for (const event of events) {
    const duration = Math.max(0, Number(event.duration || 0));
    const category = categorizeFocusFrogEvent(event, categoryRules);
    const key = categoryKey(category);
    categoryMap[key] = categoryMap[key] || { category, duration: 0 };
    categoryMap[key].duration += duration;
    if (isNotWorkCategory(category)) notWorkDuration += duration;
  }
  const activeSeconds = Math.max(0, activeDuration);
  const boundedNotWork = Math.min(activeSeconds, notWorkDuration);
  return {
    activeDuration: activeSeconds,
    workDuration: Math.max(0, activeSeconds - boundedNotWork),
    notWorkDuration: boundedNotWork,
    categoryDurations: Object.values(categoryMap).sort((a, b) => b.duration - a.duration),
  };
}

// Tracked sums of the part of each event that falls inside [start, end).
export function summarizeEventsInRange(
  events: any[],
  categoryRules: any[],
  start: moment.Moment,
  end: moment.Moment
): WorkCategorySummary {
  const clipped = events.flatMap(event => {
    const duration = Math.max(0, Number(event.duration || 0));
    const eventStart = moment(event.timestamp);
    if (!eventStart.isValid() || duration <= 0) return [];
    const eventEnd = eventStart.clone().add(duration, 'seconds');
    const seconds = moment.min(eventEnd, end).diff(moment.max(eventStart, start), 'seconds', true);
    return seconds > 0 ? [{ ...event, duration: seconds }] : [];
  });
  const active = clipped.reduce((total, event) => total + event.duration, 0);
  return summarizeActiveEvents(clipped, active, categoryRules);
}

// Tracked sums per hour from the start of the day up to `end` (the last hour may be partial).
export function summarizeHours(
  events: any[],
  categoryRules: any[],
  dayStart: moment.Moment,
  end: moment.Moment
): WorkCategorySummary[] {
  const hours: WorkCategorySummary[] = [];
  for (let cursor = dayStart.clone(); cursor.isBefore(end); cursor = cursor.add(1, 'hour')) {
    const hourEnd = moment.min(cursor.clone().add(1, 'hour'), end);
    hours.push(summarizeEventsInRange(events, categoryRules, cursor, hourEnd));
  }
  return hours;
}

// One result of buildWorkSummaryQuery -> tracked sums.
export function summarizeWorkQueryResult(result: any, categoryRules: any[]): WorkCategorySummary {
  const activeEvents = addAfkGraceToActiveEvents(
    result.activeEvents || [],
    result.rawActiveEvents || []
  );
  return summarizeActiveEvents(activeEvents, sumEventDurations(activeEvents), categoryRules);
}

// The day tracking began on these hosts (today if nothing was tracked yet).
export function recordingStartDay(
  buckets: any[],
  hosts: string[],
  startOfDay: string
): moment.Moment {
  const supportedHosts = new Set(hosts);
  const candidates = buckets
    .filter(bucket => {
      const host = bucket.hostname || bucket.data?.hostname;
      return supportedHosts.has(host) && ['currentwindow', 'afkstatus'].includes(bucket.type);
    })
    .flatMap(bucket => [bucket.metadata?.start, bucket.first_seen, bucket.created])
    .filter(value => Boolean(value))
    .map(value => moment(value))
    .filter(value => value.isValid());

  if (candidates.length === 0) return moment(get_today_with_offset(startOfDay));
  return moment.min(candidates).clone().subtract(get_offset_duration(startOfDay)).startOf('day');
}
