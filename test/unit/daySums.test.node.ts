import moment from 'moment';
import {
  currentDaySums,
  datesToSum,
  DAY_SUM_VERSION,
  daySummary,
  hoursInRange,
} from '../../src/util/daySums';
import type { DaySum } from '../../src/util/daySums';
import {
  summarizeActiveEvents,
  summarizeEventsInRange,
  summarizeHours,
} from '../../src/util/workDay';

const rules: any[] = [
  [['Work', 'Programming'], { type: 'regex', regex: 'Code' }],
  [['Media'], { type: 'regex', regex: 'YouTube' }],
];
const event = (time: string, minutes: number, title: string) => ({
  timestamp: `2026-11-05T${time}:00.000Z`,
  duration: minutes * 60,
  data: { app: 'Editor', title },
});
// 08:30-09:30 coding, 09:45-10:15 video, 10:30-10:40 coding.
const events = [
  event('08:30', 60, 'Code'),
  event('09:45', 30, 'YouTube'),
  event('10:30', 10, 'Code'),
];
const dayStart = moment('2026-11-05T04:00:00.000Z');
const now = moment('2026-11-05T10:35:00.000Z');

const totals = (summary: {
  activeDuration: number;
  workDuration: number;
  notWorkDuration: number;
}) => [
  Math.round(summary.activeDuration),
  Math.round(summary.workDuration),
  Math.round(summary.notWorkDuration),
];

describe('hourly sums for the phone', () => {
  test('a range counts only the part of each event inside it', () => {
    const range = summarizeEventsInRange(
      events,
      rules,
      moment('2026-11-05T09:00:00.000Z'),
      moment('2026-11-05T10:00:00.000Z')
    );
    // 30 min coding (09:00-09:30) + 15 min video (09:45-10:00).
    expect(totals(range)).toEqual([45 * 60, 30 * 60, 15 * 60]);
  });

  test('the hours add up to the whole day', () => {
    const hours = summarizeHours(events, rules, dayStart, now);
    expect(hours).toHaveLength(7); // 04:00 ... 10:00, the last one until 10:35
    const whole = summarizeEventsInRange(events, rules, dayStart, now);
    const day: DaySum = {
      version: DAY_SUM_VERSION,
      date: '2026-11-05',
      hosts: 1,
      computedAt: now.toISOString(),
      contextKey: 'k',
      hours,
      ...whole,
    };
    expect(totals(hoursInRange(day, dayStart, dayStart, now))).toEqual(totals(whole));
    // Until the 10:00 point of the timeline: the hour of coding and 15 minutes of video.
    const untilTen = hoursInRange(day, dayStart, dayStart, moment('2026-11-05T10:00:00.000Z'));
    expect(totals(untilTen)).toEqual([75 * 60, 60 * 60, 15 * 60]);
  });

  test('the same events give the same sums as the whole-day summary', () => {
    const whole = summarizeEventsInRange(events, rules, dayStart, moment(dayStart).add(1, 'day'));
    const active = events.reduce((total, e) => total + e.duration, 0);
    expect(totals(whole)).toEqual(totals(summarizeActiveEvents(events, active, rules)));
  });

  test('the phone skips days in the old format and counts missing days as zero', () => {
    const days = currentDaySums({
      '2026-11-04': { version: 1, date: '2026-11-04', activeDuration: 9 },
      '2026-11-05': { version: DAY_SUM_VERSION, date: '2026-11-05', activeDuration: 60 },
    });
    expect(Object.keys(days)).toEqual(['2026-11-05']);
    expect(totals(daySummary(undefined))).toEqual([0, 0, 0]);
  });
});

describe('which days the Mac sums up', () => {
  // Summed up the morning after, so final.
  const finalDay = (date: string, contextKey = 'rules') =>
    ({
      version: DAY_SUM_VERSION,
      date,
      contextKey,
      computedAt: moment(date).add(1, 'day').hour(12).toISOString(),
    } as DaySum);
  const store = (...days: DaySum[]) => Object.fromEntries(days.map(day => [day.date, day]));
  const pick = (current: Record<string, DaySum>, today: string) =>
    datesToSum(current, today, 'rules', '04:00');

  test('the first run fills this week and the last finished one', () => {
    const dates = pick({}, '2026-11-06'); // a Friday
    expect(dates[0]).toBe('2026-10-26');
    expect(dates[dates.length - 1]).toBe('2026-11-06');
    expect(dates).toHaveLength(12);
  });

  test('nothing older than that: its raw events are gone, it would look like holidays', () => {
    const dates = pick({}, '2026-11-09'); // the next Monday
    expect(dates[0]).toBe('2026-11-02');
  });

  test('final days stay, today is always summed up', () => {
    expect(pick(store(finalDay('2026-11-05')), '2026-11-06')).not.toContain('2026-11-05');
    expect(pick(store(finalDay('2026-11-05')), '2026-11-06')).toContain('2026-11-06');
  });

  test('a day summed up while it ran is done again', () => {
    const running = { ...finalDay('2026-11-05'), computedAt: '2026-11-05T10:00:00.000Z' };
    expect(pick(store(running), '2026-11-06')).toContain('2026-11-05');
  });

  test('after weeks away, the gap is filled (no events, so holidays)', () => {
    const dates = pick(store(finalDay('2026-11-20')), '2026-12-25');
    expect(dates[0]).toBe('2026-11-21');
    expect(dates).toContain('2026-12-01');
  });

  test('changed rules redo recent days only', () => {
    const old = store(finalDay('2026-10-20', 'old'), finalDay('2026-11-03', 'old'));
    const dates = pick(old, '2026-11-06');
    expect(dates).toContain('2026-11-03');
    expect(dates).not.toContain('2026-10-20');
  });
});
