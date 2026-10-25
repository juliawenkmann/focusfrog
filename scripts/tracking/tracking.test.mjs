// Run with: node --test scripts/tracking/
// The exhaustive equivalence checks against ActivityWatch's Python code live in the
// differential fuzz/gate harness; these are fast regression tests for the port.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatIso, parseIsoMicros, secondsToMicros } from './aw-time.mjs';
import {
  AwEvent,
  flood,
  filterPeriodIntersect,
  mergeEventsByKeys,
  categorize,
  Rule,
} from './aw-transforms.mjs';
import { runQueries } from './aw-query.mjs';
import { TrackingStore, eventToJson } from './aw-store.mjs';
import { retentionCutoff } from './retention.mjs';

const quiet = { warn: () => undefined, error: () => undefined };
const at = iso => parseIsoMicros(iso);
const ev = (iso, seconds, data) =>
  new AwEvent({ timestamp: at(iso), duration: secondsToMicros(seconds), data });

test('timestamps keep millisecond resolution and format like Python isoformat', () => {
  const event = ev('2026-10-12T08:00:00.123456+00:00', 1.5, {});
  assert.equal(formatIso(event.timestamp), '2026-10-12T08:00:00.123000+00:00');
  assert.equal(formatIso(at('2026-10-12T08:00:00+02:00')), '2026-10-12T06:00:00+00:00');
});

test('float seconds convert to microseconds like timedelta(seconds=...)', () => {
  assert.equal(secondsToMicros(1820.407), 1820407000);
  assert.equal(secondsToMicros(0.1 + 0.2), 300000);
  // The double nearest 2.0000005 lies just above the half, so Python rounds up.
  assert.equal(secondsToMicros(2.0000005), 2000001);
});

test('flood fills small gaps from the longer neighbour', () => {
  const result = flood([
    ev('2026-10-12T08:00:00Z', 10, { a: 1 }),
    ev('2026-10-12T08:00:12Z', 5, { a: 2 }),
  ]);
  assert.deepEqual(
    result.map(e => e.duration),
    [12_000_000, 5_000_000]
  );
});

test('filter_period_intersect keeps only overlapping time', () => {
  const result = filterPeriodIntersect(
    [ev('2026-10-12T08:00:00Z', 60, { app: 'x' })],
    [ev('2026-10-12T08:00:30Z', 60, { status: 'not-afk' })]
  );
  assert.deepEqual(
    result.map(e => [formatIso(e.timestamp), e.duration]),
    [['2026-10-12T08:00:30+00:00', 30_000_000]]
  );
});

test('merge and categorize pick the deepest, last matching category', () => {
  const events = [ev('2026-10-12T08:00:00Z', 5, { app: 'Code', title: 'main.ipynb' })];
  categorize(events, [
    [['Work'], new Rule({ type: 'regex', regex: 'Code' })],
    [['Work', 'Programming'], new Rule({ type: 'regex', regex: '\\.ipynb\\b' })],
    [['Other', 'Thing'], new Rule({ type: 'regex', regex: 'main' })],
  ]);
  assert.deepEqual(events[0].data.$category, ['Other', 'Thing']);
  assert.equal(mergeEventsByKeys(events, ['app'])[0].id, null);
});

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'focusfrog-tracking-'));
  const store = new TrackingStore({ dir, log: quiet });
  store.load();
  clearInterval(store.checkpointTimer);
  store.createBucket('aw-watcher-window_host', {
    type: 'currentwindow',
    client: 'test',
    hostname: 'host',
  });
  return { dir, store };
}

test('heartbeats merge within the pulse window and survive a restart', () => {
  const { dir, store } = tempStore();
  const hb = (iso, data) => new AwEvent({ timestamp: at(iso), duration: 0, data });
  store.heartbeat('aw-watcher-window_host', hb('2026-10-12T08:00:00Z', { app: 'A' }), 2);
  store.heartbeat('aw-watcher-window_host', hb('2026-10-12T08:00:01Z', { app: 'A' }), 2);
  store.heartbeat('aw-watcher-window_host', hb('2026-10-12T08:00:02Z', { app: 'A' }), 2);
  store.heartbeat('aw-watcher-window_host', hb('2026-10-12T08:00:03Z', { app: 'B' }), 2);
  store.heartbeat('aw-watcher-window_host', hb('2026-10-12T08:00:04Z', { app: 'B' }), 2);
  store.close();

  const reloaded = new TrackingStore({ dir, log: quiet });
  reloaded.load();
  clearInterval(reloaded.checkpointTimer);
  const events = reloaded.getEvents('aw-watcher-window_host').map(eventToJson);
  assert.deepEqual(
    events.map(e => [e.data.app, e.duration]),
    [
      ['B', 1],
      ['A', 2],
    ]
  );
});

test('ranged reads clip to the period and round the end up by 1 ms', () => {
  const { store } = tempStore();
  store.insertEvents('aw-watcher-window_host', [ev('2026-10-12T01:00:00Z', 7200, { app: 'A' })]);
  const [clipped] = store.getEvents('aw-watcher-window_host', {
    start: at('2026-10-12T02:00:00Z'),
    end: at('2026-10-12T02:30:00Z'),
  });
  assert.equal(formatIso(clipped.timestamp), '2026-10-12T02:00:00+00:00');
  assert.equal(clipped.duration, 1800_001_000);
});

test('queries run against the store', () => {
  const { store } = tempStore();
  store.insertEvents('aw-watcher-window_host', [ev('2026-10-12T08:00:00Z', 30, { app: 'A' })]);
  const [result] = runQueries(
    '',
    ['e = query_bucket("aw-watcher-window_host"); RETURN = sum_durations(e);'],
    ['2026-10-12T00:00:00+00:00/2026-10-13T00:00:00+00:00'],
    store
  );
  assert.equal(result.us, 30_000_000);
});

test('cleanup keeps the last finished week and waits for missing summaries', () => {
  const nowMs = new Date(2026, 9, 21, 12, 0).getTime(); // Wednesday, Oct 21
  const oldestEventUs = new Date(2026, 9, 1, 10, 0).getTime() * 1000;
  const summaries = { '2026-09-28': {}, '2026-10-05': {} };
  assert.equal(
    retentionCutoff({ nowMs, startOfDay: '04:00', summaries, oldestEventUs }),
    new Date(2026, 9, 12, 4, 0).getTime() * 1000
  );
  assert.equal(
    retentionCutoff({ nowMs, startOfDay: '04:00', summaries: { '2026-10-05': {} }, oldestEventUs }),
    null
  );
});
