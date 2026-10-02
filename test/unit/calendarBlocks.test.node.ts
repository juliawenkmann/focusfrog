import {
  describeRepeat,
  layoutDay,
  minutesToTime,
  occurrencesForDates,
  occursOn,
  shiftSeries,
  TimeBlock,
} from '../../src/util/calendarBlocks';

const block = (overrides: Partial<TimeBlock> = {}): TimeBlock => ({
  id: 'block-1',
  title: 'Deep work',
  type: 'deep-work',
  // 2026-10-05 is a Monday
  date: '2026-10-05',
  start: '09:00',
  end: '11:00',
  notes: '',
  repeat: 'none',
  repeatDays: [],
  repeatUntil: '',
  skipDates: [],
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  ...overrides,
});

describe('calendar blocks', () => {
  test('one-off blocks only occur on their date', () => {
    expect(occursOn(block(), '2026-10-05')).toBe(true);
    expect(occursOn(block(), '2026-10-06')).toBe(false);
  });

  test('weekday repeats skip weekends and never start before the first date', () => {
    const weekdays = block({ repeat: 'weekdays' });
    expect(occursOn(weekdays, '2026-10-04')).toBe(false);
    expect(occursOn(weekdays, '2026-10-09')).toBe(true);
    expect(occursOn(weekdays, '2026-10-10')).toBe(false);
  });

  test('weekly repeats use the chosen weekdays, end dates and skipped dates', () => {
    const weekly = block({
      repeat: 'weekly',
      repeatDays: [1, 3],
      repeatUntil: '2026-10-21',
      skipDates: ['2026-10-12'],
    });
    expect(occursOn(weekly, '2026-10-07')).toBe(true);
    expect(occursOn(weekly, '2026-10-08')).toBe(false);
    expect(occursOn(weekly, '2026-10-12')).toBe(false);
    expect(occursOn(weekly, '2026-10-19')).toBe(true);
    expect(occursOn(weekly, '2026-10-26')).toBe(false);
  });

  test('biweekly repeats skip every other week', () => {
    const biweekly = block({ repeat: 'biweekly' });
    expect(occursOn(biweekly, '2026-10-12')).toBe(false);
    expect(occursOn(biweekly, '2026-10-19')).toBe(true);
  });

  test('monthly repeats fall back to the last day of shorter months', () => {
    const monthly = block({ date: '2026-01-31', repeat: 'monthly' });
    expect(occursOn(monthly, '2026-02-28')).toBe(true);
    expect(occursOn(monthly, '2026-03-31')).toBe(true);
    expect(occursOn(monthly, '2026-03-30')).toBe(false);
  });

  test('places overlapping events side by side', () => {
    const occurrences = occurrencesForDates(
      [
        block({ id: 'a', start: '09:00', end: '11:00' }),
        block({ id: 'b', start: '10:00', end: '12:00' }),
        block({ id: 'c', start: '13:00', end: '14:00' }),
      ],
      ['2026-10-05']
    );
    const layout = Object.fromEntries(
      layoutDay(occurrences).map(item => [item.block.id, [item.column, item.columns]])
    );
    expect(layout).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] });
  });

  test('describes repeat rules in plain words', () => {
    expect(describeRepeat(block({ repeat: 'weekly', repeatDays: [3, 1] }))).toBe(
      'Weekly on Mon, Wed'
    );
    expect(describeRepeat(block({ repeat: 'weekdays', repeatUntil: '2026-12-18' }))).toBe(
      'Every weekday until Dec 18'
    );
    expect(describeRepeat(block())).toBe('');
  });

  test('moving a series shifts its weekdays with it', () => {
    expect(shiftSeries(block({ repeat: 'weekly', repeatDays: [1, 7] }), 1)).toEqual({
      date: '2026-10-06',
      repeatDays: [1, 2],
    });
  });

  test('formats midnight as an end time', () => {
    expect(minutesToTime(24 * 60)).toBe('24:00');
    expect(minutesToTime(9 * 60 + 15)).toBe('09:15');
  });
});
