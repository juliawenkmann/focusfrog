// The Mac's daily work sums as stored in the cloud (`days/`), and how the phone reads them.
// Written by sync/daySums.ts on the Mac; read by the Hours page on the phone.
import moment from 'moment';
import { get_day_period } from '~/util/time';
import { sumWorkSummaries } from '~/util/weeklySummaries';
import type { WorkCategorySummary } from '~/util/workReport';

export const DAY_SUMS_KEY = 'daySums';
// 2: tracked time only, plus hosts and today's hours (1 included manual work).
export const DAY_SUM_VERSION = 2;

export interface DaySum extends WorkCategorySummary {
  version: number;
  date: string;
  // How many tracked devices the Mac reads (the Hours page shows "2 devices").
  hosts: number;
  // The day tracking began, YYYY-MM-DD ("Since recording" counts from here).
  recordingStart?: string;
  // Today only: one entry per hour from the start of the day until computedAt.
  hours?: WorkCategorySummary[];
  computedAt: string;
  contextKey: string;
}

// A day is final once it was summed after it ended.
export const isFinalDay = (day: DaySum, startOfDay: string) =>
  !moment(day.computedAt).isBefore(moment(get_day_period(day.date, startOfDay).split('/')[1]));

// The days to sum up. Raw events are kept for this week and the last finished one, so that
// is as far back as anything can be queried, or as far back as the Mac was gone (no events
// were pruned while it was). Older days keep their sums: querying them would return nothing
// and make them look like holidays.
export function datesToSum(
  current: Record<string, DaySum>,
  todayKey: string,
  contextKey: string,
  startOfDay: string
): string[] {
  const lastWeek = moment(todayKey).startOf('isoWeek').subtract(1, 'week').format('YYYY-MM-DD');
  const finalDates = Object.values(current)
    .filter(day => day.version === DAY_SUM_VERSION && isFinalDay(day, startOfDay))
    .map(day => day.date)
    .sort();
  const newestFinal = finalDates[finalDates.length - 1];
  const dayAfter = newestFinal && moment(newestFinal).add(1, 'day').format('YYYY-MM-DD');
  const first = dayAfter && dayAfter < lastWeek ? dayAfter : lastWeek;
  const dates: string[] = [];
  for (let cursor = moment(first); cursor.format('YYYY-MM-DD') <= todayKey; cursor.add(1, 'day')) {
    const date = cursor.format('YYYY-MM-DD');
    const day = current[date];
    if (
      day?.version !== DAY_SUM_VERSION ||
      day.contextKey !== contextKey ||
      !isFinalDay(day, startOfDay)
    ) {
      dates.push(date);
    }
  }
  return dates;
}

// What the phone reads. Days in the old format (with manual work included) are skipped.
export function currentDaySums(value: unknown): Record<string, DaySum> {
  const days: Record<string, DaySum> = {};
  Object.entries((value || {}) as Record<string, DaySum>).forEach(([date, day]) => {
    if (day?.version === DAY_SUM_VERSION) days[date] = day;
  });
  return days;
}

// A day's tracked sums; a day the Mac never sent counts as nothing tracked.
export const daySummary = (day?: DaySum): WorkCategorySummary => sumWorkSummaries(day ? [day] : []);

// Tracked sums of the hours of `day` that start inside [start, end).
export function hoursInRange(
  day: DaySum | undefined,
  dayStart: moment.Moment,
  start: moment.Moment,
  end: moment.Moment
): WorkCategorySummary {
  return sumWorkSummaries(
    (day?.hours || []).filter((_hour, index) => {
      const hourStart = dayStart.clone().add(index, 'hours');
      return !hourStart.isBefore(start) && hourStart.isBefore(end);
    })
  );
}
