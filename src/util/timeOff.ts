// Holidays and Feiertage for the Hours page: which days were free, and how many of the
// year's holidays are used. Pure functions, so the rules can be tested on their own.
import moment from 'moment';
import type { DaySum } from '~/util/daySums';
import { isFinalDay } from '~/util/daySums';
import type { ManualWorkEntry } from '~/util/workDay';

export const HOLIDAYS_PER_YEAR = 30;
// What a workday should have: 40h a week over 5 days.
export const WORK_DAY_SECONDS = 8 * 3600;
export const WORK_WEEK_SECONDS = 5 * WORK_DAY_SECONDS;
// A weekday with less work than this was a holiday.
export const HOLIDAY_WORK_LIMIT_SECONDS = 3600;

const DATE = 'YYYY-MM-DD';

// What the owner decided by hand; synced as a setting.
export interface HolidayChoices {
  // Days that are holidays anyway: before day history began, or planned.
  added: string[];
  // Days detected as holidays that were not (sick, worked away from the computer, ...).
  notCounted: string[];
}

export const NO_HOLIDAY_CHOICES: HolidayChoices = { added: [], notCounted: [] };

export function normalizeHolidayChoices(value: unknown): HolidayChoices {
  const raw = (value || {}) as Partial<HolidayChoices>;
  const dates = (list: unknown) =>
    Array.isArray(list)
      ? Array.from(new Set(list.filter(date => moment(date, DATE, true).isValid()))).sort()
      : [];
  return { added: dates(raw.added), notCounted: dates(raw.notCounted) };
}

// Easter Sunday (anonymous Gregorian algorithm).
function easterSunday(year: number): moment.Moment {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return moment([year, month - 1, day]);
}

const feiertageByYear = new Map<number, Record<string, string>>();

// The Feiertage of Bavaria, as in Würzburg (so with Mariä Himmelfahrt), by date.
export function feiertage(year: number): Record<string, string> {
  let days = feiertageByYear.get(year);
  if (!days) {
    const easter = easterSunday(year);
    const afterEaster = (offset: number) => easter.clone().add(offset, 'days').format(DATE);
    days = {
      [`${year}-01-01`]: 'Neujahr',
      [`${year}-01-06`]: 'Heilige Drei Könige',
      [afterEaster(-2)]: 'Karfreitag',
      [afterEaster(1)]: 'Ostermontag',
      [`${year}-05-01`]: 'Tag der Arbeit',
      [afterEaster(39)]: 'Christi Himmelfahrt',
      [afterEaster(50)]: 'Pfingstmontag',
      [afterEaster(60)]: 'Fronleichnam',
      [`${year}-08-15`]: 'Mariä Himmelfahrt',
      [`${year}-10-03`]: 'Tag der Deutschen Einheit',
      [`${year}-11-01`]: 'Allerheiligen',
      [`${year}-12-25`]: '1. Weihnachtstag',
      [`${year}-12-26`]: '2. Weihnachtstag',
    };
    feiertageByYear.set(year, days);
  }
  return days;
}

export const isWeekday = (date: string) => moment(date, DATE).isoWeekday() <= 5;

// The Feiertag on this date, if it falls on a day that would otherwise be a workday.
export function weekdayFeiertag(date: string): string {
  return isWeekday(date) ? feiertage(Number(date.slice(0, 4)))[date] || '' : '';
}

export interface HolidayDay {
  date: string;
  // detected: from the hours. added: by hand.
  source: 'detected' | 'added';
  counted: boolean;
}

export interface HolidayInput {
  days: Record<string, DaySum>;
  manualEntries: ManualWorkEntry[];
  choices: HolidayChoices;
  todayKey: string;
  startOfDay: string;
}

// Work on a day that shows the owner worked: tracked and entered by hand. The automatic
// daily meeting hour is not in here, or no day could ever be a holiday.
function workedSeconds(day: DaySum, manualEntries: ManualWorkEntry[]): number {
  return manualEntries.reduce(
    (total, entry) => (entry.date === day.date ? total + entry.minutes * 60 : total),
    day.workDuration
  );
}

// Every holiday and every detected day that was excluded, by date. A day is only judged
// once it is over and the Mac has sent its final sums; today can still become a workday.
export function holidayDays(input: HolidayInput): HolidayDay[] {
  const { days, manualEntries, choices, todayKey, startOfDay } = input;
  const notCounted = new Set(choices.notCounted);
  const found = new Map<string, HolidayDay>();
  choices.added.forEach(date => {
    if (isWeekday(date) && !weekdayFeiertag(date)) {
      found.set(date, { date, source: 'added', counted: true });
    }
  });
  Object.values(days).forEach(day => {
    if (
      day.date < todayKey &&
      isWeekday(day.date) &&
      !weekdayFeiertag(day.date) &&
      isFinalDay(day, startOfDay) &&
      workedSeconds(day, manualEntries) < HOLIDAY_WORK_LIMIT_SECONDS
    ) {
      const counted = !notCounted.has(day.date);
      found.set(day.date, { date: day.date, source: 'detected', counted });
    }
  });
  return Array.from(found.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function toggleHolidayDay(choices: HolidayChoices, day: HolidayDay): HolidayChoices {
  const without = (list: string[]) => list.filter(date => date !== day.date);
  if (day.source === 'added') return { ...choices, added: without(choices.added) };
  return day.counted
    ? { added: without(choices.added), notCounted: [...choices.notCounted, day.date].sort() }
    : { ...choices, notCounted: without(choices.notCounted) };
}

// Adds the workdays between two dates (Feiertage and weekends cost no holiday).
export function addHolidayRange(choices: HolidayChoices, from: string, to: string): HolidayChoices {
  const added = new Set(choices.added);
  const notCounted = new Set(choices.notCounted);
  const last = moment(to, DATE);
  for (let cursor = moment(from, DATE); cursor.isSameOrBefore(last); cursor.add(1, 'day')) {
    const date = cursor.format(DATE);
    if (isWeekday(date) && !weekdayFeiertag(date)) {
      added.add(date);
      notCounted.delete(date);
    }
  }
  return { added: Array.from(added).sort(), notCounted: Array.from(notCounted).sort() };
}

// The holidays that are free days: those within each year's allowance. Days past the
// allowance are normal workdays, so they show up as missing work.
export function creditedHolidays(holidays: HolidayDay[]): Set<string> {
  const usedPerYear = new Map<string, number>();
  const credited = new Set<string>();
  holidays
    .filter(day => day.counted)
    .forEach(day => {
      const year = day.date.slice(0, 4);
      const used = usedPerYear.get(year) || 0;
      if (used < HOLIDAYS_PER_YEAR) credited.add(day.date);
      usedPerYear.set(year, used + 1);
    });
  return credited;
}

export interface NextFeiertag {
  date: string;
  name: string;
}

// The next Feiertag on a weekday after today (it may be next year).
export function nextWeekdayFeiertag(todayKey: string): NextFeiertag | null {
  const year = Number(todayKey.slice(0, 4));
  for (const candidate of [year, year + 1]) {
    const date = Object.keys(feiertage(candidate))
      .sort()
      .find(day => day > todayKey && weekdayFeiertag(day));
    if (date) return { date, name: feiertage(candidate)[date] };
  }
  return null;
}

// The Feiertage on weekdays still to come this year.
export function remainingWeekdayFeiertage(todayKey: string): number {
  const days = Object.keys(feiertage(Number(todayKey.slice(0, 4))));
  return days.filter(day => day > todayKey && weekdayFeiertag(day)).length;
}

// Why no work is expected on this date, if so: weekends, Feiertage and holidays are free.
export function freeDayLabel(date: string, creditedDays: Set<string>): string {
  if (!isWeekday(date)) return 'Weekend';
  return weekdayFeiertag(date) || (creditedDays.has(date) ? 'Holiday' : '');
}

// The work that levels the scale over these days: a normal workday for each day not free.
export function balancedSeconds(dates: string[], isFreeDay: (date: string) => boolean): number {
  return dates.filter(date => !isFreeDay(date)).length * WORK_DAY_SECONDS;
}

export interface HolidayRun {
  // Which week of the list, the first day within it (Monday is 0), and how many days in a row.
  week: number;
  firstDay: number;
  days: number;
}

// Where holidays fall in a chart of weeks: each run of consecutive days within a week.
export function holidayRuns(weekStarts: string[], holidayDates: Set<string>): HolidayRun[] {
  const runs: HolidayRun[] = [];
  weekStarts.forEach((weekStart, week) => {
    let run: HolidayRun | null = null;
    for (let day = 0; day < 7; day++) {
      const date = moment(weekStart, DATE).add(day, 'days').format(DATE);
      if (!holidayDates.has(date)) {
        run = null;
      } else if (run) {
        run.days += 1;
      } else {
        run = { week, firstDay: day, days: 1 };
        runs.push(run);
      }
    }
  });
  return runs;
}
