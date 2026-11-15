// The Time blocking calendar is one long strip of days that scrolls sideways. Every day has
// a fixed place on it (index 0 is the strip's first day), and only the days near the view are
// drawn. So the scroll position never has to be moved while someone is scrolling.
import moment from 'moment';

const DATE_FORMAT = 'YYYY-MM-DD';

// Two years back and two years ahead of the day the strip is laid out around.
export const STRIP_DAYS_BACK = 731;
export const STRIP_DAYS = 2 * STRIP_DAYS_BACK + 1;

export function addDays(date: string, days: number): string {
  return moment.utc(date, DATE_FORMAT).add(days, 'days').format(DATE_FORMAT);
}

export function daysBetween(from: string, to: string): number {
  return moment.utc(to, DATE_FORMAT).diff(moment.utc(from, DATE_FORMAT), 'days');
}

// The visible days share the width, but a day never gets narrower than `min`.
export function fitDayWidth(available: number, count: number, min: number): number {
  return Math.max(min, Math.floor(available / count));
}

// The first day at least partly in view for a scroll position (a pixel or two short of a
// whole day still counts as that day).
export function firstVisibleIndex(
  scrollLeft: number,
  width: number,
  count: number,
  total = STRIP_DAYS
): number {
  return Math.max(0, Math.min(total - count, Math.floor((scrollLeft + 2) / width)));
}

// The days drawn: the visible ones and at least a week on each side, in whole weeks, so what is
// drawn changes only once a week of scrolling.
export function drawnRange(
  first: number,
  count: number,
  total = STRIP_DAYS,
  margin = 7
): { start: number; end: number } {
  return {
    start: Math.max(0, Math.floor((first - margin) / margin) * margin),
    end: Math.min(total, Math.ceil((first + count + margin) / margin) * margin),
  };
}
