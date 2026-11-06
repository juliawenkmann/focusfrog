import { DAY_SUM_VERSION } from '../../src/util/daySums';
import type { DaySum } from '../../src/util/daySums';
import {
  addHolidayRange,
  creditedHolidays,
  feiertage,
  freeDayLabel,
  holidayDays,
  HOLIDAYS_PER_YEAR,
  nextWeekdayFeiertag,
  NO_HOLIDAY_CHOICES,
  normalizeHolidayChoices,
  remainingWeekdayFeiertage,
  toggleHolidayDay,
  weekdayFeiertag,
} from '../../src/util/timeOff';

// A day the Mac summed up after it ended.
const day = (date: string, workMinutes: number): DaySum => ({
  version: DAY_SUM_VERSION,
  date,
  hosts: 1,
  computedAt: '2026-12-31T12:00:00.000Z',
  contextKey: 'k',
  activeDuration: workMinutes * 60,
  workDuration: workMinutes * 60,
  notWorkDuration: 0,
  categoryDurations: [],
});

const input = (days: DaySum[], overrides = {}) => ({
  days: Object.fromEntries(days.map(entry => [entry.date, entry])),
  manualEntries: [],
  choices: NO_HOLIDAY_CHOICES,
  todayKey: '2026-11-20',
  startOfDay: '04:00',
  ...overrides,
});

const manual = (date: string, minutes: number) => ({
  id: 'manual-' + date,
  date,
  startTime: '',
  minutes,
  category: ['Work'],
  note: '',
  createdAt: date,
  updatedAt: date,
});

describe('Feiertage in Bavaria', () => {
  test('follow Easter (2026: April 5, 2027: March 28)', () => {
    expect(feiertage(2026)['2026-04-03']).toBe('Karfreitag');
    expect(feiertage(2026)['2026-04-06']).toBe('Ostermontag');
    expect(feiertage(2026)['2026-05-14']).toBe('Christi Himmelfahrt');
    expect(feiertage(2026)['2026-05-25']).toBe('Pfingstmontag');
    expect(feiertage(2026)['2026-06-04']).toBe('Fronleichnam');
    expect(feiertage(2027)['2027-03-26']).toBe('Karfreitag');
    expect(feiertage(2027)['2027-03-29']).toBe('Ostermontag');
  });

  test('has the 13 days, including Mariä Himmelfahrt for Würzburg', () => {
    expect(Object.keys(feiertage(2026))).toHaveLength(13);
    expect(feiertage(2026)['2026-08-15']).toBe('Mariä Himmelfahrt');
    expect(feiertage(2026)['2026-01-06']).toBe('Heilige Drei Könige');
    expect(feiertage(2026)['2026-11-01']).toBe('Allerheiligen');
  });

  test('on a weekend it changes nothing', () => {
    expect(weekdayFeiertag('2026-06-04')).toBe('Fronleichnam'); // Thursday
    expect(weekdayFeiertag('2026-08-15')).toBe(''); // Saturday
    expect(weekdayFeiertag('2026-11-01')).toBe(''); // Sunday
  });

  test('the next one on a weekday, also into next year', () => {
    expect(nextWeekdayFeiertag('2026-11-06')).toEqual({
      date: '2026-12-25',
      name: '1. Weihnachtstag',
    });
    expect(nextWeekdayFeiertag('2026-12-25')?.date).toBe('2027-01-01');
    expect(remainingWeekdayFeiertage('2026-11-06')).toBe(1);
  });
});

describe('a holiday taken', () => {
  const dates = (days: DaySum[], overrides = {}) =>
    holidayDays(input(days, overrides))
      .filter(entry => entry.counted)
      .map(entry => entry.date);

  test('is a weekday with less than one hour of work', () => {
    expect(dates([day('2026-11-03', 59)])).toEqual(['2026-11-03']);
    expect(dates([day('2026-11-03', 60)])).toEqual([]);
    expect(dates([day('2026-11-03', 0)])).toEqual(['2026-11-03']);
  });

  test('never a weekend or a Feiertag', () => {
    expect(dates([day('2026-11-07', 0), day('2026-11-08', 0)])).toEqual([]);
    expect(dates([day('2026-06-04', 0)])).toEqual([]);
  });

  test('manual work counts as work', () => {
    const entries = { manualEntries: [manual('2026-11-03', 45)] };
    expect(dates([day('2026-11-03', 20)], entries)).toEqual([]);
    expect(dates([day('2026-11-03', 10)], entries)).toEqual(['2026-11-03']);
  });

  test('today is not judged yet, nor a day whose final sums have not arrived', () => {
    expect(dates([day('2026-11-20', 0)])).toEqual([]);
    const notFinal = { ...day('2026-11-03', 0), computedAt: '2026-11-03T10:00:00.000Z' };
    expect(dates([notFinal])).toEqual([]);
  });

  test('a day without sums is unknown, not a holiday', () => {
    expect(dates([])).toEqual([]);
  });

  test('can be excluded and brought back', () => {
    const [detected] = holidayDays(input([day('2026-11-03', 0)]));
    const excluded = toggleHolidayDay(NO_HOLIDAY_CHOICES, detected);
    expect(excluded.notCounted).toEqual(['2026-11-03']);
    const [shown] = holidayDays(input([day('2026-11-03', 0)], { choices: excluded }));
    expect(shown.counted).toBe(false);
    expect(toggleHolidayDay(excluded, shown).notCounted).toEqual([]);
  });

  test('a range adds its workdays only, and a day can be removed again', () => {
    // Monday June 1 to Sunday June 7: June 4 is Fronleichnam, 6 and 7 are the weekend.
    const choices = addHolidayRange(NO_HOLIDAY_CHOICES, '2026-06-01', '2026-06-07');
    expect(choices.added).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-05']);
    const [first] = holidayDays(input([], { choices }));
    expect(first).toEqual({ date: '2026-06-01', source: 'added', counted: true });
    expect(toggleHolidayDay(choices, first).added).not.toContain('2026-06-01');
  });

  test('adding a day takes back an earlier exclusion', () => {
    const choices = { added: [], notCounted: ['2026-11-03'] };
    expect(addHolidayRange(choices, '2026-11-03', '2026-11-03').notCounted).toEqual([]);
  });

  test('only the allowance of each year is free on the scale', () => {
    const added: string[] = [];
    for (let week = 0; week < 7; week++) {
      for (let weekday = 0; weekday < 5; weekday++) {
        const date = new Date(Date.UTC(2026, 6, 6 + week * 7 + weekday));
        added.push(date.toISOString().slice(0, 10));
      }
    }
    const days = holidayDays(input([], { choices: { added, notCounted: [] } }));
    expect(days).toHaveLength(35);
    const credited = creditedHolidays(days);
    expect(credited.size).toBe(HOLIDAYS_PER_YEAR);
    expect(credited.has(added[29])).toBe(true);
    expect(credited.has(added[30])).toBe(false);
  });

  test('the allowance restarts each year', () => {
    const days = [
      { date: '2026-12-30', source: 'added', counted: true },
      { date: '2027-01-04', source: 'added', counted: true },
    ] as const;
    expect(creditedHolidays([...days]).size).toBe(2);
  });

  test('excluded days are not free', () => {
    const credited = creditedHolidays([{ date: '2026-11-03', source: 'detected', counted: false }]);
    expect(credited.size).toBe(0);
  });
});

test('stored choices are cleaned up', () => {
  expect(normalizeHolidayChoices(undefined)).toEqual(NO_HOLIDAY_CHOICES);
  expect(
    normalizeHolidayChoices({ added: ['2026-11-03', 'nonsense', '2026-11-03'], notCounted: 5 })
  ).toEqual({ added: ['2026-11-03'], notCounted: [] });
});

describe('the balance', () => {
  // June 2026: the 4th is Fronleichnam; the 6th and 7th are the weekend.
  const none = new Set<string>();

  test('weekends, Feiertage and holidays are free, and say why', () => {
    expect(freeDayLabel('2026-06-06', none)).toBe('Weekend');
    expect(freeDayLabel('2026-06-07', none)).toBe('Weekend');
    expect(freeDayLabel('2026-06-04', none)).toBe('Fronleichnam');
    expect(freeDayLabel('2026-06-02', new Set(['2026-06-02']))).toBe('Holiday');
    expect(freeDayLabel('2026-06-02', none)).toBe('');
  });

  test('a Feiertag on a weekend stays a weekend', () => {
    expect(freeDayLabel('2026-08-15', none)).toBe('Weekend');
  });
});
