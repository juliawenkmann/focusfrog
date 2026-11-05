import moment from 'moment';
import { currentDaySums, DAY_SUM_VERSION, daySummary, hoursInRange } from '../../src/util/daySums';
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
