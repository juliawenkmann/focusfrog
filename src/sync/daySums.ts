// The Mac's daily work sums, sent to the cloud so the phone can show the same Hours page.
// Only sums leave the Mac (work, not work, time per category, per day and for today per
// hour) — never window titles, URLs or app names; firebase/firestore.rules refuse anything
// else in `days/`. Manual work is not included: every device adds it itself, exactly as
// the Hours page does. Runs while FocusFrog is open on the Mac and the owner is signed in.
import moment from 'moment';
import { useBucketsStore } from '~/stores/buckets';
import { useCategoryStore } from '~/stores/categories';
import { useSettingsStore } from '~/stores/settings';
import { keySync, onOwnerSignIn } from '~/sync/cloud';
import { getClient } from '~/util/awclient';
import { get_day_period, get_today_with_offset } from '~/util/time';
import { DAY_SUM_VERSION, DAY_SUMS_KEY } from '~/util/daySums';
import type { DaySum } from '~/util/daySums';
import { weeklySummaryContextKey } from '~/util/weeklySummaries';
import {
  currentWeekDates,
  recordingStartDay,
  summarizeHours,
  summarizeWorkQueryResult,
} from '~/util/workDay';
import {
  addAfkGraceToActiveEvents,
  buildWorkSummaryQuery,
  enabledWorkReportHosts,
} from '~/util/workReport';

const INTERVAL_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;

// The sums without the time they were computed, to tell whether anything changed.
const sums = (day: Partial<DaySum> = {}) => JSON.stringify({ ...day, computedAt: '' });

// A day is final once it was summed after it ended.
const isFinal = (day: DaySum | undefined, period: string) =>
  day !== undefined && !moment(day.computedAt).isBefore(moment(period.split('/')[1]));

let running = false;
let lastRun = 0;

// Today, plus the days of this week the cloud does not have in final form for the current
// rules. Only days whose sums changed are written.
async function uploadDaySums(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const sync = await keySync(DAY_SUMS_KEY);
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
    const dates = currentWeekDates(todayKey).filter(date => {
      const day = current[date];
      return (
        day?.version !== DAY_SUM_VERSION ||
        day.contextKey !== contextKey ||
        !isFinal(day, get_day_period(date, settings.startOfDay))
      );
    });
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
