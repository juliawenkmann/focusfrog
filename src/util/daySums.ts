// The Mac's daily work sums as stored in the cloud (`days/`), and how the phone reads them.
// Written by sync/daySums.ts on the Mac; read by the Hours page on the phone.
import moment from 'moment';
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
