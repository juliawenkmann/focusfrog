// The Mac's daily work sums, sent to the cloud so the phone can show the same Hours page.
// Only sums leave the Mac (work, not work, time per category, per day and for today per
// hour) — never window titles, URLs or app names; firebase/firestore.rules refuse anything
// else in `days/`. Manual work is not included: every device adds it itself, exactly as
// the Hours page does. Runs while FocusFrog is open on the Mac (the Mac's own page, or the
// hosted one through sync/macBridge.ts); the Mac's page keeps them in storage.json too.
import moment from 'moment';
import { useBucketsStore } from '~/stores/buckets';
import { useCategoryStore } from '~/stores/categories';
import { useSettingsStore } from '~/stores/settings';
import { onOwnerSignIn } from '~/sync/cloud';
import { getClient } from '~/util/awclient';
import { get_day_period, get_today_with_offset } from '~/util/time';
import { DAY_SUM_VERSION, DAY_SUMS_KEY, datesToSum } from '~/util/daySums';
import { loadStoredValue, saveStoredValue } from '~/util/focusfrogStorage';
import type { DaySum } from '~/util/daySums';
import { weeklySummaryContextKey } from '~/util/weeklySummaries';
import { recordingStartDay, summarizeHours, summarizeWorkQueryResult } from '~/util/workDay';
import {
  addAfkGraceToActiveEvents,
  buildWorkSummaryQuery,
  enabledWorkReportHosts,
} from '~/util/workReport';

const INTERVAL_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;

// The sums without the time they were computed, to tell whether anything changed.
const sums = (day: Partial<DaySum> = {}) => JSON.stringify({ ...day, computedAt: '' });

let running = false;
let lastRun = 0;
// Checked before each run; a run is skipped when it says no (see startDaySumUploads).
let ready: () => Promise<boolean> = async () => true;

const sentListeners = new Set<(days: Record<string, DaySum>) => void>();

// The Hours page on this Mac hears about new day sums here. Returns how to stop listening.
export function onDaySumsSent(listener: (days: Record<string, DaySum>) => void): () => void {
  sentListeners.add(listener);
  return () => sentListeners.delete(listener);
}

// Sums up today and every other day that needs it. Only days whose sums changed are written.
async function uploadDaySums(): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (Date.now() - lastRun < MIN_GAP_MS) return;
    if (!(await ready())) return;
    lastRun = Date.now();
    const settings = useSettingsStore();
    const buckets = useBucketsStore();
    await Promise.all([settings.ensureLoaded(), buckets.ensureLoaded()]);
    const categories = useCategoryStore();
    categories.load();
    const hosts = enabledWorkReportHosts(buckets.buckets || []);
    if (!hosts.length) return;
    const rules = categories.classes_for_query || [];
    const contextKey = weeklySummaryContextKey(hosts, rules, settings.startOfDay);
    const todayKey = get_today_with_offset(settings.startOfDay);
    const current = ((await loadStoredValue(DAY_SUMS_KEY)).value || {}) as Record<string, DaySum>;
    const dates = datesToSum(current, todayKey, contextKey, settings.startOfDay);
    const timeperiods = dates.map(date => get_day_period(date, settings.startOfDay));
    const results = await getClient().query(timeperiods, [buildWorkSummaryQuery(hosts, '[]', [])]);
    const now = moment();
    const recordingStart = recordingStartDay(buckets.buckets || [], hosts, settings.startOfDay);
    const changed: Record<string, DaySum> = {};
    dates.forEach((date, index) => {
      const result = results[index] || {};
      const day: DaySum = {
        version: DAY_SUM_VERSION,
        date,
        hosts: hosts.length,
        recordingStart: recordingStart.format('YYYY-MM-DD'),
        computedAt: now.toISOString(),
        contextKey,
        ...summarizeWorkQueryResult(result, rules),
      };
      if (date === todayKey) {
        const [start, end] = timeperiods[index].split('/').map(time => moment(time));
        const events = addAfkGraceToActiveEvents(
          result.activeEvents || [],
          result.rawActiveEvents || []
        );
        day.hours = summarizeHours(events, rules, start, moment.min(now, end));
      }
      if (sums(day) !== sums(current[date])) changed[date] = day;
    });
    if (Object.keys(changed).length) {
      const days = { ...current, ...changed };
      void saveStoredValue(DAY_SUMS_KEY, days);
      sentListeners.forEach(listener => listener(days));
    }
  } catch (error) {
    console.warn('FocusFrog could not send today’s sums to the phone:', error);
  } finally {
    running = false;
  }
}

// Started once by the Mac app, or by the hosted FocusFrog when it is open on the Mac
// (sync/macBridge.ts), which passes `whenReady`: no run until it says the Mac's settings are in.
export function startDaySumUploads(whenReady?: () => Promise<boolean>): void {
  if (whenReady) ready = whenReady;
  void uploadDaySums();
  onOwnerSignIn(() => void uploadDaySums());
  window.setInterval(() => void uploadDaySums(), INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void uploadDaySums();
  });
}
