import { IBucket } from '~/util/interfaces';

export interface WorkReportHostOption {
  value: string;
  text: string;
  disabled: boolean;
}

export interface WorkCategorySummary {
  activeDuration: number;
  workDuration: number;
  notWorkDuration: number;
  categoryDurations: CategoryDuration[];
}

export interface CategoryDuration {
  category: string[];
  duration: number;
}

export const AFK_GRACE_SECONDS = 5 * 60;

interface TimedInterval {
  startMs: number;
  endMs: number;
}

function eventInterval(event: any): TimedInterval | null {
  const startMs = new Date(event?.timestamp).getTime();
  const duration = Math.max(0, Number(event?.duration || 0));
  if (!Number.isFinite(startMs) || duration <= 0) return null;
  return {
    startMs,
    endMs: startMs + duration * 1000,
  };
}

function mergeIntervals(intervals: TimedInterval[]): TimedInterval[] {
  const sorted = intervals
    .filter(interval => interval.endMs > interval.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const merged: TimedInterval[] = [];

  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.startMs > previous.endMs) {
      merged.push({ ...interval });
    } else {
      previous.endMs = Math.max(previous.endMs, interval.endMs);
    }
  }

  return merged;
}

function intersectWithIntervals(interval: TimedInterval, masks: TimedInterval[]): TimedInterval[] {
  return masks
    .map(mask => ({
      startMs: Math.max(interval.startMs, mask.startMs),
      endMs: Math.min(interval.endMs, mask.endMs),
    }))
    .filter(overlap => overlap.endMs > overlap.startMs);
}

function subtractIntervals(intervals: TimedInterval[], blockers: TimedInterval[]): TimedInterval[] {
  let remaining = intervals;

  for (const blocker of blockers) {
    remaining = remaining.flatMap(interval => {
      if (blocker.endMs <= interval.startMs || blocker.startMs >= interval.endMs) {
        return [interval];
      }

      const pieces: TimedInterval[] = [];
      if (blocker.startMs > interval.startMs) {
        pieces.push({ startMs: interval.startMs, endMs: blocker.startMs });
      }
      if (blocker.endMs < interval.endMs) {
        pieces.push({ startMs: blocker.endMs, endMs: interval.endMs });
      }
      return pieces;
    });
    if (remaining.length === 0) break;
  }

  return remaining;
}

export function sumEventDurations(events: any[]): number {
  return events.reduce((total, event) => total + Math.max(0, Number(event?.duration || 0)), 0);
}

export function addAfkGraceToActiveEvents(
  activeEvents: any[] = [],
  rawEvents: any[] = [],
  graceSeconds = AFK_GRACE_SECONDS
): any[] {
  if (activeEvents.length === 0 || rawEvents.length === 0 || graceSeconds <= 0) {
    return activeEvents;
  }

  const activeIntervals = mergeIntervals(
    activeEvents
      .map(event => eventInterval(event))
      .filter((value): value is TimedInterval => Boolean(value))
  );
  if (activeIntervals.length === 0) return activeEvents;

  const graceMs = graceSeconds * 1000;
  const graceIntervals = mergeIntervals(
    activeIntervals.map(interval => ({
      startMs: interval.endMs,
      endMs: interval.endMs + graceMs,
    }))
  );

  const graceEvents: any[] = [];
  for (const event of rawEvents) {
    const rawInterval = eventInterval(event);
    if (!rawInterval) continue;

    const graceOverlaps = intersectWithIntervals(rawInterval, graceIntervals);
    const extraIntervals = subtractIntervals(graceOverlaps, activeIntervals);

    for (const interval of extraIntervals) {
      const duration = (interval.endMs - interval.startMs) / 1000;
      if (duration <= 0) continue;
      graceEvents.push({
        ...event,
        timestamp: new Date(interval.startMs).toISOString(),
        duration,
        data: { ...(event.data || {}), $afk_grace: true },
      });
    }
  }

  return [...activeEvents, ...graceEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

function getWindowHosts(buckets: IBucket[]): string[] {
  const hosts = buckets
    .filter(bucket => bucket.type === 'currentwindow')
    .map(bucket => bucket.id.replace('aw-watcher-window_', ''));
  return [...new Set(hosts)];
}

function getAFKHosts(buckets: IBucket[]): Set<string> {
  return new Set(
    buckets
      .filter(bucket => bucket.type === 'afkstatus')
      .map(bucket => bucket.id.replace('aw-watcher-afk_', ''))
  );
}

export function getWorkReportHostOptions(buckets: IBucket[]): WorkReportHostOption[] {
  const afkHosts = getAFKHosts(buckets);
  return getWindowHosts(buckets).map(host => {
    const hasAFK = afkHosts.has(host);
    return {
      value: host,
      text: hasAFK ? host : `${host} (requires aw-watcher-afk)`,
      disabled: !hasAFK,
    };
  });
}

export function getUnsupportedWorkReportHosts(
  selectedHosts: string[],
  buckets: IBucket[]
): string[] {
  const afkHosts = getAFKHosts(buckets);
  return selectedHosts.filter(host => !afkHosts.has(host));
}

export function getSupportedWorkReportHosts(selectedHosts: string[], buckets: IBucket[]): string[] {
  const unsupportedHosts = new Set(getUnsupportedWorkReportHosts(selectedHosts, buckets));
  return selectedHosts.filter(host => !unsupportedHosts.has(host));
}

export function expandSelectedCategories(
  allCategories: string[][],
  selectedCategories: string[][]
): string[][] {
  const isDescendant = (selected: string[], category: string[]) =>
    category.length >= selected.length && selected.every((segment, i) => category[i] === segment);

  const expanded: string[][] = [];
  const seen = new Set<string>();

  for (const category of allCategories) {
    if (selectedCategories.some(selected => isDescendant(selected, category))) {
      const key = JSON.stringify(category);
      if (!seen.has(key)) {
        seen.add(key);
        expanded.push(category);
      }
    }
  }

  // Keep explicitly selected categories even if the current settings do not
  // list them yet. That makes a default "Work" summary degrade to zero work
  // hours instead of failing.
  for (const selected of selectedCategories) {
    const key = JSON.stringify(selected);
    if (!seen.has(key)) {
      seen.add(key);
      expanded.push(selected);
    }
  }

  return expanded;
}

// Builds the aw-query string for the Work Time Report. Extracted from the
// component so the generated query can be snapshot-tested — that's how we
// catch arg-count regressions like flood(events, breakTime) which aw-query
// rejects with "Tried to call function flood with invalid amount of arguments".
export function buildWorkReportQuery(
  hosts: string[],
  categoriesStr: string,
  categoriesFilter: any[]
): string {
  let query = '';
  for (let hi = 0; hi < hosts.length; hi++) {
    const hostname = hosts[hi];
    query += `
            events_${hi} = flood(query_bucket("aw-watcher-window_${hostname}"));
            not_afk_${hi} = flood(query_bucket("aw-watcher-afk_${hostname}"));
            not_afk_${hi} = filter_keyvals(not_afk_${hi}, "status", ["not-afk"]);
            events_${hi} = filter_period_intersect(events_${hi}, not_afk_${hi});
            events_${hi} = categorize(events_${hi}, ${categoriesStr});
            events_${hi} = filter_keyvals(events_${hi}, "$category", ${JSON.stringify(
      categoriesFilter
    )});
          `;
  }
  query += '\nevents = [];';
  for (let hi = 0; hi < hosts.length; hi++) {
    query += `\nevents = union_no_overlap(events, events_${hi});`;
  }
  query += `
          duration = sum_durations(events);
          RETURN = {"events": events, "duration": duration};
        `;
  // Strip per-line trailing whitespace so the snapshot test stays stable
  // under the trailing-whitespace pre-commit hook. aw-query is whitespace-
  // tolerant so this has no runtime effect.
  return query
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .join('\n');
}

export function buildWorkSummaryQuery(
  hosts: string[],
  _categoriesStr: string,
  _categoriesFilter: any[]
): string {
  let query = '';
  for (let hi = 0; hi < hosts.length; hi++) {
    const hostname = hosts[hi];
    query += `
            active_${hi} = flood(query_bucket("aw-watcher-window_${hostname}"));
            raw_active_${hi} = active_${hi};
            not_afk_${hi} = flood(query_bucket("aw-watcher-afk_${hostname}"));
            not_afk_${hi} = filter_keyvals(not_afk_${hi}, "status", ["not-afk"]);
            active_${hi} = filter_period_intersect(active_${hi}, not_afk_${hi});
          `;
  }
  query += '\nactive = [];';
  query += '\nraw_active = [];';
  for (let hi = 0; hi < hosts.length; hi++) {
    query += `\nactive = union_no_overlap(active, active_${hi});`;
    query += `\nraw_active = union_no_overlap(raw_active, raw_active_${hi});`;
  }
  query += `
          active_duration = sum_durations(active);
          RETURN = {"activeDuration": active_duration, "activeEvents": active, "rawActiveEvents": raw_active};
        `;
  return query
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .join('\n');
}
