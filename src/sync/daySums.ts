// Sends the Mac's daily work sums to the cloud so the phone can show Hours.
// Only sums leave the Mac (work, not work, time per category) — never window titles,
// URLs or app names; firebase/firestore.rules refuse anything else in `days/`.
// Runs while FocusFrog is open on the Mac and the owner is signed in.
import { useBucketsStore } from '~/stores/buckets';
import { useCategoryStore } from '~/stores/categories';
import { useSettingsStore } from '~/stores/settings';
import { keySync, onOwnerSignIn } from '~/sync/cloud';
import { getClient } from '~/util/awclient';
import { peekStoredValue } from '~/util/focusfrogStorage';
import { get_day_period, get_today_with_offset } from '~/util/time';
import { weeklySummaryContextKey } from '~/util/weeklySummaries';
import {
  applyManualWork,
  currentWeekDates,
  MANUAL_WORK_SERVER_KEY,
  normalizeManualWorkEntries,
  summarizeWorkQueryResult,
} from '~/util/workDay';
import { buildWorkSummaryQuery, enabledWorkReportHosts } from '~/util/workReport';
import type { WorkCategorySummary } from '~/util/workReport';

const INTERVAL_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;

export interface DaySum extends WorkCategorySummary {
  date: string;
  manualWorkDuration: number;
  computedAt: string;
  contextKey: string;
}

const round = (seconds: number) => Math.round(Math.max(0, seconds) * 10) / 10;

function daySum(
  date: string,
  tracked: WorkCategorySummary,
  withManual: WorkCategorySummary,
  contextKey: string,
  computedAt: string
): DaySum {
  return {
    date,
    activeDuration: round(withManual.activeDuration),
    workDuration: round(withManual.workDuration),
    notWorkDuration: round(withManual.notWorkDuration),
    manualWorkDuration: round(withManual.workDuration - tracked.workDuration),
    categoryDurations: withManual.categoryDurations
      .map(row => ({ category: row.category, duration: round(row.duration) }))
      .filter(row => row.duration > 0),
    computedAt,
    contextKey,
  };
}

// The sums without the time they were computed, to tell whether anything changed.
const sums = (day: Partial<DaySum> = {}) => JSON.stringify({ ...day, computedAt: '' });

let running = false;
let lastRun = 0;

// Today, plus the days of this week the cloud does not have for the current rules.
// Only days whose sums changed are written.
async function uploadDaySums(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const sync = await keySync('daySums');
    if (!sync || Date.now() - lastRun < MIN_GAP_MS) return;
    lastRun = Date.now();
    const settings = useSettingsStore();
    const buckets = useBucketsStore();
    await Promise.all([settings.ensureLoaded(), buckets.ensureLoaded(), sync.whenReady()]);
    const categories = useCategoryStore();
    categories.load();
    const hosts = enabledWorkReportHosts(buckets.buckets || []);
    if (!hosts.length) return;
    const rules = categories.classes_for_query || [];
    const contextKey = weeklySummaryContextKey(hosts, rules, settings.startOfDay);
    const todayKey = get_today_with_offset(settings.startOfDay);
    const current = (sync.value() || {}) as Record<string, DaySum>;
    const dates = currentWeekDates(todayKey).filter(
      date => date === todayKey || current[date]?.contextKey !== contextKey
    );
    const timeperiods = dates.map(date => get_day_period(date, settings.startOfDay));
    const [results, manual] = await Promise.all([
      getClient().query(timeperiods, [buildWorkSummaryQuery(hosts, '[]', [])]),
      peekStoredValue(MANUAL_WORK_SERVER_KEY),
    ]);
    const entries = normalizeManualWorkEntries(manual.value);
    const computedAt = new Date().toISOString();
    const changed: Record<string, DaySum> = {};
    dates.forEach((date, index) => {
      const tracked = summarizeWorkQueryResult(results[index], rules);
      const withManual = applyManualWork(tracked, entries, [timeperiods[index]], todayKey);
      const day = daySum(date, tracked, withManual, contextKey, computedAt);
      if (sums(day) !== sums(current[date])) changed[date] = day;
    });
    if (Object.keys(changed).length) sync.save({ ...current, ...changed });
  } catch (error) {
    console.warn('FocusFrog could not send today’s sums to the phone:', error);
  } finally {
    running = false;
  }
}

// Started once by the Mac app (not the phone build).
export function startDaySumUploads(): void {
  onOwnerSignIn(() => void uploadDaySums());
  window.setInterval(() => void uploadDaySums(), INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void uploadDaySums();
  });
}
