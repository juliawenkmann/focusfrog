import {
  addDays,
  daysBetween,
  drawnRange,
  firstVisibleIndex,
  fitDayWidth,
  STRIP_DAYS,
  STRIP_DAYS_BACK,
} from '../../src/util/dayStrip';

describe('the strip of days', () => {
  test('reaches two years back and ahead, with the middle day in the middle', () => {
    expect(STRIP_DAYS).toBe(2 * STRIP_DAYS_BACK + 1);
    const start = addDays('2026-11-15', -STRIP_DAYS_BACK);
    expect(daysBetween(start, '2026-11-15')).toBe(STRIP_DAYS_BACK);
  });

  test('counts whole days, also over a change to winter time', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  test('the visible days share the width, but stay readable', () => {
    expect(fitDayWidth(1050, 7, 106)).toBe(150);
    expect(fitDayWidth(1000, 7, 106)).toBe(142); // rounded down, never wider than fits
    expect(fitDayWidth(320, 7, 106)).toBe(106); // a phone shows part of the week
    expect(fitDayWidth(320, 1, 144)).toBe(320);
  });

  test('the left edge is the first day still partly in view', () => {
    expect(firstVisibleIndex(0, 150, 7)).toBe(0);
    expect(firstVisibleIndex(150 * 731, 150, 7)).toBe(731);
    expect(firstVisibleIndex(150 * 731 + 140, 150, 7)).toBe(731);
    expect(firstVisibleIndex(150 * 731 - 1.5, 150, 7)).toBe(731); // a snap a bit short
    expect(firstVisibleIndex(150 * 731 - 3, 150, 7)).toBe(730);
  });

  test('the left edge stays on the strip', () => {
    expect(firstVisibleIndex(-40, 150, 7)).toBe(0);
    expect(firstVisibleIndex(150 * STRIP_DAYS, 150, 7)).toBe(STRIP_DAYS - 7);
  });

  test('a week around the view is drawn, in whole weeks', () => {
    expect(drawnRange(731, 7)).toEqual({ start: 721, end: 749 });
    // Scrolling a few days does not change what is drawn.
    expect(drawnRange(733, 7)).toEqual({ start: 721, end: 749 });
    expect(drawnRange(735, 7)).toEqual({ start: 728, end: 749 });
    expect(drawnRange(731, 1)).toEqual({ start: 721, end: 742 });
  });

  test('what is drawn always covers the visible days with a margin', () => {
    for (let first = 0; first < 60; first++) {
      for (const count of [1, 3, 7]) {
        const { start, end } = drawnRange(first, count, 2000);
        expect(start).toBeLessThanOrEqual(Math.max(0, first - 7));
        expect(end).toBeGreaterThanOrEqual(first + count + 7);
      }
    }
  });

  test('nothing is drawn past the ends of the strip', () => {
    expect(drawnRange(0, 7).start).toBe(0);
    expect(drawnRange(STRIP_DAYS - 7, 7).end).toBe(STRIP_DAYS);
  });
});
