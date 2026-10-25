import moment from 'moment';
import {
  completedWeekStarts,
  createWeeklySummary,
  mergeWeeklySummaryStores,
  normalizeWeeklySummaryStore,
  sumWorkSummaries,
  weeklySummaryContextKey,
  WEEKLY_SUMMARY_VERSION,
} from '../../src/util/weeklySummaries';

const day = (work: number, notWork: number) => ({
  activeDuration: work + notWork,
  workDuration: work,
  notWorkDuration: notWork,
  categoryDurations: [
    { category: ['Work', 'Programming'], duration: work },
    { category: ['Media'], duration: notWork },
  ],
});

describe('weekly summaries', () => {
  test('lists only weeks that have fully ended', () => {
    const weeks = completedWeekStarts(moment('2026-06-03'), moment('2026-06-22'));
    expect(weeks).toEqual(['2026-06-01', '2026-06-08', '2026-06-15']);
  });

  test('has no completed weeks during the first week of recording', () => {
    expect(completedWeekStarts(moment('2026-10-20'), moment('2026-10-19'))).toEqual([]);
  });

  test('sums days and merges categories', () => {
    const total = sumWorkSummaries([day(3600, 600), day(1800, 0)]);
    expect(total.activeDuration).toBe(6000);
    expect(total.workDuration).toBe(5400);
    expect(total.notWorkDuration).toBe(600);
    expect(total.categoryDurations).toEqual([
      { category: ['Work', 'Programming'], duration: 5400 },
      { category: ['Media'], duration: 600 },
    ]);
  });

  test('stores compact records that survive a round trip', () => {
    const summary = createWeeklySummary(
      '2026-06-01',
      'ctx',
      sumWorkSummaries([day(3600.123456, 0)]),
      '2026-06-08T10:00:00.000Z'
    );
    expect(summary.workDuration).toBe(3600.123);
    expect(summary.categoryDurations).toEqual([
      { category: ['Work', 'Programming'], duration: 3600.123 },
    ]);
    const store = normalizeWeeklySummaryStore(
      JSON.parse(JSON.stringify({ '2026-06-01': summary }))
    );
    expect(store['2026-06-01']).toEqual(summary);
  });

  test('drops malformed or mismatched records', () => {
    const good = createWeeklySummary('2026-06-01', 'ctx', day(60, 0), '');
    const store = normalizeWeeklySummaryStore({
      '2026-06-01': good,
      '2026-06-08': { ...good },
      'not-a-date': good,
      '2026-06-15': { ...good, weekStart: '2026-06-15', version: WEEKLY_SUMMARY_VERSION + 1 },
    });
    expect(Object.keys(store)).toEqual(['2026-06-01']);
  });

  test('changes the context key when rules, hosts or day start change', () => {
    const base = weeklySummaryContextKey(['a', 'b'], [['Work'], {}], '04:00');
    expect(weeklySummaryContextKey(['b', 'a'], [['Work'], {}], '04:00')).toBe(base);
    expect(weeklySummaryContextKey(['a'], [['Work'], {}], '04:00')).not.toBe(base);
    expect(weeklySummaryContextKey(['a', 'b'], [['Media'], {}], '04:00')).not.toBe(base);
    expect(weeklySummaryContextKey(['a', 'b'], [['Work'], {}], '05:00')).not.toBe(base);
  });

  test('keeps the newest record per week when merging stores', () => {
    const older = createWeeklySummary('2026-06-01', 'a', day(60, 0), '2026-06-08T00:00:00Z');
    const newer = createWeeklySummary('2026-06-01', 'b', day(120, 0), '2026-06-09T00:00:00Z');
    expect(mergeWeeklySummaryStores({ '2026-06-01': newer }, { '2026-06-01': older })).toEqual({
      '2026-06-01': newer,
    });
  });
});
