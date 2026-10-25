// Automatic weekly cleanup: raw window/AFK events are kept for the current and the
// last finished week; older ones are deleted, but only for weeks whose sums the
// Hours page has already stored (storage key "weeklySummaries").

export const RAW_EVENT_TYPES = ['currentwindow', 'afkstatus'];

function parseStartOfDay(startOfDay) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(startOfDay || '04:00'));
  return match ? { hours: Number(match[1]), minutes: Number(match[2]) } : { hours: 4, minutes: 0 };
}

function dateKey(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Local Monday (as a Date at midnight) of the week that contains the offset-adjusted day of `instantMs`.
function weekMonday(instantMs, offset) {
  const shifted = new Date(instantMs);
  shifted.setHours(shifted.getHours() - offset.hours, shifted.getMinutes() - offset.minutes);
  const monday = new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function weekStartInstant(monday, offset) {
  return new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate(),
    offset.hours,
    offset.minutes
  ).getTime();
}

// Returns the instant (µs) before which raw events may be deleted, or null when
// nothing may be deleted yet.
export function retentionCutoff({ nowMs, startOfDay, summaries, oldestEventUs }) {
  if (oldestEventUs === null || oldestEventUs === undefined) return null;
  const offset = parseStartOfDay(startOfDay);
  const lastFinished = weekMonday(nowMs, offset);
  lastFinished.setDate(lastFinished.getDate() - 7);
  let cutoffMs = weekStartInstant(lastFinished, offset);

  const week = weekMonday(Math.floor(oldestEventUs / 1000), offset);
  while (weekStartInstant(week, offset) < cutoffMs) {
    if (!summaries || !summaries[dateKey(week)]) {
      cutoffMs = weekStartInstant(week, offset);
      break;
    }
    week.setDate(week.getDate() + 7);
  }
  const cutoffUs = cutoffMs * 1000;
  return cutoffUs > oldestEventUs ? cutoffUs : null;
}
