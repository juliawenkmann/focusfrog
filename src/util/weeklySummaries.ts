import moment from 'moment';
import { categoryKey } from '~/util/focusfrogCategories';
import type { CategoryDuration, WorkCategorySummary } from '~/util/workReport';

// Finished weeks are kept as sums so long ranges never have to re-query raw events.
export const WEEKLY_SUMMARY_VERSION = 1;
export const WEEKLY_SUMMARY_STORAGE_KEY = 'focusfrog.weeklySummaries.v1';
export const WEEKLY_SUMMARY_SERVER_KEY = 'weeklySummaries';

export interface WeeklySummary extends WorkCategorySummary {
  version: number;
  // Monday of the ISO week, YYYY-MM-DD.
  weekStart: string;
  // Fingerprint of the hosts, category rules and day start the sums were computed with.
  contextKey: string;
  computedAt: string;
  // True when the context changed but raw events were gone, so the older sums were kept.
  keptAfterContextChange?: boolean;
}

export type WeeklySummaryStore = Record<string, WeeklySummary>;

function roundSeconds(value: number): number {
  return Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
}

export function weeklySummaryContextKey(
  hosts: string[],
  categoryRules: unknown,
  startOfDay: string
): string {
  return hashString(JSON.stringify([[...hosts].sort(), categoryRules, startOfDay]));
}

export function sumWorkSummaries(summaries: WorkCategorySummary[]): WorkCategorySummary {
  const categoryMap: Record<string, CategoryDuration> = {};
  let activeDuration = 0;
  let workDuration = 0;
  let notWorkDuration = 0;

  for (const summary of summaries) {
    activeDuration += summary.activeDuration;
    workDuration += summary.workDuration;
    notWorkDuration += summary.notWorkDuration;
    for (const row of summary.categoryDurations) {
      const key = categoryKey(row.category);
      categoryMap[key] = categoryMap[key] || { category: row.category, duration: 0 };
      categoryMap[key].duration += row.duration;
    }
  }

  return {
    activeDuration,
    workDuration,
    notWorkDuration,
    categoryDurations: Object.values(categoryMap).sort((a, b) => b.duration - a.duration),
  };
}

export function createWeeklySummary(
  weekStart: string,
  contextKey: string,
  summary: WorkCategorySummary,
  computedAt: string
): WeeklySummary {
  return {
    version: WEEKLY_SUMMARY_VERSION,
    weekStart,
    contextKey,
    computedAt,
    activeDuration: roundSeconds(summary.activeDuration),
    workDuration: roundSeconds(summary.workDuration),
    notWorkDuration: roundSeconds(summary.notWorkDuration),
    categoryDurations: summary.categoryDurations
      .map(row => ({ category: row.category, duration: roundSeconds(row.duration) }))
      .filter(row => row.duration > 0),
  };
}

// Mondays of every week that has fully ended, from the week containing firstDay
// up to (not including) currentWeekStart.
export function completedWeekStarts(
  firstDay: moment.Moment,
  currentWeekStart: moment.Moment
): string[] {
  const weeks: string[] = [];
  const cursor = firstDay.clone().startOf('isoWeek');
  const end = currentWeekStart.clone().startOf('isoWeek');
  while (cursor.isBefore(end)) {
    weeks.push(cursor.format('YYYY-MM-DD'));
    cursor.add(1, 'week');
  }
  return weeks;
}

function normalizeCategoryDurations(value: unknown): CategoryDuration[] | null {
  if (!Array.isArray(value)) return null;
  const rows: CategoryDuration[] = [];
  for (const row of value) {
    const category = (row as CategoryDuration)?.category;
    const duration = Number((row as CategoryDuration)?.duration);
    if (!Array.isArray(category) || !category.every(part => typeof part === 'string')) return null;
    if (!Number.isFinite(duration)) return null;
    rows.push({ category, duration });
  }
  return rows;
}

export function normalizeWeeklySummaryStore(value: unknown): WeeklySummaryStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const store: WeeklySummaryStore = {};
  for (const [weekStart, raw] of Object.entries(value as Record<string, unknown>)) {
    const summary = raw as Partial<WeeklySummary>;
    if (!moment(weekStart, 'YYYY-MM-DD', true).isValid()) continue;
    if (!summary || summary.version !== WEEKLY_SUMMARY_VERSION) continue;
    if (summary.weekStart !== weekStart || typeof summary.contextKey !== 'string') continue;
    const categoryDurations = normalizeCategoryDurations(summary.categoryDurations);
    const numbers = [summary.activeDuration, summary.workDuration, summary.notWorkDuration];
    if (!categoryDurations || !numbers.every(number => Number.isFinite(number))) continue;
    store[weekStart] = {
      version: WEEKLY_SUMMARY_VERSION,
      weekStart,
      contextKey: summary.contextKey,
      computedAt: typeof summary.computedAt === 'string' ? summary.computedAt : '',
      ...(summary.keptAfterContextChange ? { keptAfterContextChange: true } : {}),
      activeDuration: Number(summary.activeDuration),
      workDuration: Number(summary.workDuration),
      notWorkDuration: Number(summary.notWorkDuration),
      categoryDurations,
    };
  }
  return store;
}

// Combines two stores, preferring the most recently computed record for each week.
export function mergeWeeklySummaryStores(
  first: WeeklySummaryStore,
  second: WeeklySummaryStore
): WeeklySummaryStore {
  const merged: WeeklySummaryStore = { ...first };
  for (const [weekStart, summary] of Object.entries(second)) {
    const existing = merged[weekStart];
    if (!existing || (summary.computedAt || '') >= (existing.computedAt || '')) {
      merged[weekStart] = summary;
    }
  }
  return merged;
}
