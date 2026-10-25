// FocusFrog's own event store, replacing ActivityWatch's SQLite datastore.
// Reads follow aw-core's Bucket.get + PeeweeStorage.get_events exactly (range
// rounding, 24 h lookback, inclusive bounds, newest-first order, clipping).
//
// On disk (all small, plain files):
//   buckets.json                 bucket metadata in creation order
//   events/<bucket>.jsonl        append-only log: {"r","i","t","d","data"} or {"r","i","x":1}
//   open.json                    latest state of each bucket's newest event (heartbeats
//                                extend it every second, so it is checkpointed, not logged)
import fs from 'node:fs';
import path from 'node:path';
import { formatIso, parseIsoMicros, secondsToMicros, truncateToMs } from './aw-time.mjs';
import { AwEvent, cloneEvent, heartbeatMerge, pyEquals, TimeDelta } from './aw-transforms.mjs';

const DAY_US = 24 * 60 * 60 * 1_000_000;
const JULIAN_EPOCH_MS = 210866760000000;
const CHECKPOINT_MS = 5000;

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

// The string SQLite compares in `starttime <= strftime(... timestamp + duration ...)`.
function sqliteEndString(timestampUs, durationUs) {
  const julianDay = (timestampUs / 1000 + JULIAN_EPOCH_MS) / 86400000.0;
  const seconds = (julianDay - 2440587.5) * 86400.0 + durationUs / 1_000_000;
  const ms = Math.trunc(seconds * 1000.0 + JULIAN_EPOCH_MS + 0.5) - JULIAN_EPOCH_MS;
  const date = new Date(ms);
  return (
    `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.` +
    `${pad(date.getUTCMilliseconds(), 3)}+00:00`
  );
}

// Python's sqlite3 adapter: datetime.isoformat(" ").
function sqliteParamString(us) {
  return formatIso(us).replace('T', ' ');
}

function bucketFileName(bucketId) {
  return `${encodeURIComponent(bucketId)}.jsonl`;
}

function writeFileAtomic(filePath, contents) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, contents, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function eventRecord(event, rev) {
  return { r: rev, i: event.id, t: event.timestamp, d: event.duration, data: event.data };
}

// SQLite answers `ORDER BY timestamp DESC` with a stable sort over the bucket's
// rows in id order, so events sharing a timestamp come back lowest id first.
function newestFirst(ascending) {
  const result = [];
  let groupEnd = ascending.length;
  while (groupEnd > 0) {
    let groupStart = groupEnd - 1;
    while (
      groupStart > 0 &&
      ascending[groupStart - 1].timestamp === ascending[groupEnd - 1].timestamp
    ) {
      groupStart -= 1;
    }
    for (let index = groupStart; index < groupEnd; index += 1) result.push(ascending[index]);
    groupEnd = groupStart;
  }
  return result;
}

export class TrackingStore {
  constructor({ dir, log = console }) {
    this.dir = dir;
    this.log = log;
    this.bucketsPath = path.join(dir, 'buckets.json');
    this.eventsDir = path.join(dir, 'events');
    this.openPath = path.join(dir, 'open.json');
    this.buckets = new Map();
    this.events = new Map();
    this.eventBucket = new Map();
    this.lastEventCache = new Map();
    this.openDirty = false;
    this.rev = 1;
    this.nextId = 1;
    this.checkpointTimer = null;
  }

  load() {
    fs.mkdirSync(this.eventsDir, { recursive: true, mode: 0o700 });
    if (fs.existsSync(this.bucketsPath)) {
      const parsed = JSON.parse(fs.readFileSync(this.bucketsPath, 'utf8'));
      for (const bucket of parsed.buckets || []) {
        this.buckets.set(bucket.id, { ...bucket, created: parseIsoMicros(bucket.created) });
        this.events.set(bucket.id, []);
      }
    }

    const records = new Map();
    const remember = (bucketId, record) => {
      const byId = records.get(bucketId) || new Map();
      const existing = byId.get(record.i);
      if (!existing || record.r >= existing.r) byId.set(record.i, record);
      records.set(bucketId, byId);
      this.rev = Math.max(this.rev, record.r + 1);
    };
    for (const bucketId of this.buckets.keys()) {
      const file = path.join(this.eventsDir, bucketFileName(bucketId));
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          remember(bucketId, JSON.parse(line));
        } catch (err) {
          this.log.warn(`Skipping unreadable event line in ${file}`);
        }
      }
    }
    if (fs.existsSync(this.openPath)) {
      const open = JSON.parse(fs.readFileSync(this.openPath, 'utf8'));
      for (const [bucketId, record] of Object.entries(open)) {
        if (this.buckets.has(bucketId) && record) remember(bucketId, record);
      }
    }

    for (const [bucketId, byId] of records) {
      const list = [];
      for (const record of byId.values()) {
        if (record.x) continue;
        list.push(
          new AwEvent({ id: record.i, timestamp: record.t, duration: record.d, data: record.data })
        );
        this.eventBucket.set(record.i, bucketId);
        this.nextId = Math.max(this.nextId, record.i + 1);
      }
      list.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
      this.events.set(bucketId, list);
    }
    this.compact();
    this.checkpointTimer = setInterval(() => this.checkpoint(), CHECKPOINT_MS);
    this.checkpointTimer.unref?.();
  }

  close() {
    if (this.checkpointTimer) clearInterval(this.checkpointTimer);
    this.checkpoint(true);
  }

  // --- persistence ------------------------------------------------------------------

  saveBuckets() {
    const buckets = [...this.buckets.values()].map(bucket => ({
      ...bucket,
      created: formatIso(bucket.created),
    }));
    writeFileAtomic(this.bucketsPath, JSON.stringify({ version: 1, buckets }, null, 2));
  }

  appendRecords(bucketId, records) {
    if (records.length === 0) return;
    const file = path.join(this.eventsDir, bucketFileName(bucketId));
    fs.appendFileSync(file, records.map(record => JSON.stringify(record)).join('\n') + '\n', {
      mode: 0o600,
    });
  }

  logEvent(bucketId, event) {
    this.appendRecords(bucketId, [eventRecord(event, this.rev++)]);
  }

  checkpoint(force = false) {
    if (!this.openDirty && !force) return;
    const open = {};
    for (const bucketId of this.events.keys()) {
      const newest = this.newestEvent(bucketId);
      if (newest) open[bucketId] = eventRecord(newest, this.rev++);
    }
    writeFileAtomic(this.openPath, JSON.stringify(open));
    this.openDirty = false;
  }

  // Rewrites every bucket log with one line per live event.
  compact() {
    for (const [bucketId, list] of this.events) {
      const file = path.join(this.eventsDir, bucketFileName(bucketId));
      const lines = list.map(event => JSON.stringify(eventRecord(event, this.rev++)));
      writeFileAtomic(file, lines.length ? lines.join('\n') + '\n' : '');
    }
    this.checkpoint(true);
  }

  // --- buckets --------------------------------------------------------------------

  bucketList() {
    return [...this.buckets.values()];
  }

  hasBucket(bucketId) {
    return this.buckets.has(bucketId);
  }

  bucketMetadata(bucketId) {
    const bucket = this.buckets.get(bucketId);
    return {
      id: bucket.id,
      created: formatIso(bucket.created),
      name: bucket.name ?? null,
      type: bucket.type,
      client: bucket.client,
      hostname: bucket.hostname,
      data: bucket.data || {},
    };
  }

  createBucket(bucketId, { type, client, hostname, created = null, name = null, data = null }) {
    if (this.buckets.has(bucketId)) return false;
    this.buckets.set(bucketId, {
      id: bucketId,
      created: created ?? Date.now() * 1000,
      name,
      type,
      client,
      hostname,
      data: data || {},
    });
    this.events.set(bucketId, []);
    this.saveBuckets();
    return true;
  }

  updateBucket(bucketId, { type, client, hostname, name, data }) {
    const bucket = this.buckets.get(bucketId);
    if (!bucket) throw new Error('Bucket did not exist, could not update');
    if (type != null) bucket.type = type;
    if (client != null) bucket.client = client;
    if (hostname != null) bucket.hostname = hostname;
    if (name != null) bucket.name = name;
    if (data != null) bucket.data = data;
    this.saveBuckets();
  }

  deleteBucket(bucketId) {
    if (!this.buckets.delete(bucketId)) throw new Error('Bucket did not exist, could not delete');
    for (const event of this.events.get(bucketId) || []) this.eventBucket.delete(event.id);
    this.events.delete(bucketId);
    this.lastEventCache.delete(bucketId);
    fs.rmSync(path.join(this.eventsDir, bucketFileName(bucketId)), { force: true });
    this.saveBuckets();
    this.checkpoint(true);
  }

  // --- events: reads -----------------------------------------------------------------

  // Indices of events matching aw-core's _where_range for the (already rounded) bounds.
  matchingEvents(bucketId, start, end) {
    const list = this.events.get(bucketId) || [];
    const lookback = start === null ? null : start - DAY_US;
    let low = 0;
    if (lookback !== null) {
      let high = list.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (list[mid].timestamp < lookback) low = mid + 1;
        else high = mid;
      }
    }
    const startParam = start === null ? null : sqliteParamString(start);
    const matches = [];
    for (let index = low; index < list.length; index += 1) {
      const event = list[index];
      if (end !== null && event.timestamp > end) break;
      if (
        startParam !== null &&
        !(startParam <= sqliteEndString(event.timestamp, event.duration))
      ) {
        continue;
      }
      matches.push(event);
    }
    return matches;
  }

  getEvents(bucketId, { limit = -1, start = null, end = null } = {}) {
    if (limit === 0) return [];
    const roundedStart = start === null ? null : truncateToMs(start);
    const roundedEnd = end === null ? null : truncateToMs(end) + 1000;
    let matches = newestFirst(this.matchingEvents(bucketId, roundedStart, roundedEnd));
    if (limit > 0) matches = matches.slice(0, limit);
    return matches.map(stored => {
      const event = cloneEvent(stored);
      if (roundedStart !== null && event.timestamp < roundedStart) {
        const eventEnd = event.timestamp + event.duration;
        event.timestamp = roundedStart;
        event.duration = eventEnd - event.timestamp;
      }
      if (roundedEnd !== null && event.timestamp + event.duration > roundedEnd) {
        event.duration = roundedEnd - event.timestamp;
      }
      return event;
    });
  }

  getEventCount(bucketId, { start = null, end = null } = {}) {
    return this.matchingEvents(bucketId, start, end).length;
  }

  getEvent(bucketId, eventId) {
    const event = (this.events.get(bucketId) || []).find(item => item.id === eventId);
    return event ? cloneEvent(event) : null;
  }

  newestEvent(bucketId) {
    const list = this.events.get(bucketId) || [];
    if (list.length === 0) return null;
    // ORDER BY timestamp DESC LIMIT 1: among equal timestamps the lowest id wins.
    let index = list.length - 1;
    while (index > 0 && list[index - 1].timestamp === list[index].timestamp) index -= 1;
    return list[index];
  }

  // --- events: writes -----------------------------------------------------------------

  // Inserts in timestamp order. When the event becomes the newest, the previous
  // newest event (extended by heartbeats only in open.json) is logged first.
  placeEvent(bucketId, event) {
    const list = this.events.get(bucketId);
    const previousNewest = this.newestEvent(bucketId);
    let index = list.length;
    while (index > 0 && list[index - 1].timestamp > event.timestamp) index -= 1;
    list.splice(index, 0, event);
    this.eventBucket.set(event.id, bucketId);
    const isNewest = this.newestEvent(bucketId) === event;
    if (isNewest && previousNewest) this.logEvent(bucketId, previousNewest);
    return isNewest;
  }

  removeEventById(eventId) {
    const bucketId = this.eventBucket.get(eventId);
    if (bucketId === undefined) return null;
    const list = this.events.get(bucketId) || [];
    const index = list.findIndex(event => event.id === eventId);
    if (index >= 0) list.splice(index, 1);
    this.eventBucket.delete(eventId);
    return bucketId;
  }

  // Bucket.insert: events with an id replace that event, others get a new id.
  insertEvents(bucketId, events) {
    for (const incoming of events) {
      const event = cloneEvent(incoming);
      if (event.id !== null && event.id !== undefined) {
        const previousBucket = this.removeEventById(event.id);
        if (previousBucket && previousBucket !== bucketId) {
          this.appendRecords(previousBucket, [{ r: this.rev++, i: event.id, x: 1 }]);
        }
      } else {
        event.id = this.nextId++;
      }
      this.nextId = Math.max(this.nextId, event.id + 1);
      const isNewest = this.placeEvent(bucketId, event);
      this.logEvent(bucketId, event);
      if (isNewest) this.openDirty = true;
    }
    return null;
  }

  deleteEvent(bucketId, eventId) {
    const list = this.events.get(bucketId) || [];
    const index = list.findIndex(event => event.id === eventId);
    if (index < 0) return false;
    list.splice(index, 1);
    this.eventBucket.delete(eventId);
    this.appendRecords(bucketId, [{ r: this.rev++, i: eventId, x: 1 }]);
    if (this.lastEventCache.get(bucketId)?.id === eventId) this.lastEventCache.delete(bucketId);
    this.openDirty = true;
    return true;
  }

  // aw_server.api.ServerAPI.heartbeat
  heartbeat(bucketId, heartbeat, pulsetime) {
    let lastEvent = this.lastEventCache.get(bucketId) || null;
    if (!lastEvent) {
      const newest = this.newestEvent(bucketId);
      lastEvent = newest ? cloneEvent(newest) : null;
    }
    if (lastEvent && pyEquals(lastEvent.data, heartbeat.data)) {
      const merged = heartbeatMerge(lastEvent, heartbeat, pulsetime);
      if (merged) {
        this.replaceNewest(bucketId, merged);
        this.lastEventCache.set(bucketId, merged);
        return merged;
      }
    }
    const inserted = cloneEvent(heartbeat);
    inserted.id = this.nextId++;
    const isNewest = this.placeEvent(bucketId, inserted);
    this.logEvent(bucketId, inserted);
    if (isNewest) this.openDirty = true;
    heartbeat.id = inserted.id;
    this.lastEventCache.set(bucketId, heartbeat);
    return heartbeat;
  }

  // PeeweeStorage.replace_last: overwrite the newest event, keeping its id.
  replaceNewest(bucketId, merged) {
    const target = this.newestEvent(bucketId);
    if (!target) return;
    const list = this.events.get(bucketId);
    const timestampChanged = target.timestamp !== merged.timestamp;
    target.timestamp = merged.timestamp;
    target.duration = merged.duration;
    target.data = structuredClone(merged.data);
    merged.id = target.id;
    if (timestampChanged) {
      list.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
      this.logEvent(bucketId, target);
    }
    this.openDirty = true;
  }

  // --- retention ---------------------------------------------------------------------------

  // Deletes events that ended before `cutoffUs` in buckets of the given types.
  pruneEndedBefore(cutoffUs, types) {
    let removed = 0;
    for (const [bucketId, list] of this.events) {
      const bucket = this.buckets.get(bucketId);
      if (!bucket || !types.includes(bucket.type)) continue;
      const kept = list.filter(event => event.timestamp + event.duration >= cutoffUs);
      for (const event of list) {
        if (event.timestamp + event.duration < cutoffUs) this.eventBucket.delete(event.id);
      }
      removed += list.length - kept.length;
      this.events.set(bucketId, kept);
    }
    if (removed > 0) {
      this.lastEventCache.clear();
      this.compact();
    }
    return removed;
  }

  // Oldest event start across buckets of the given types (null when empty).
  oldestEventStart(types) {
    let oldest = null;
    for (const [bucketId, list] of this.events) {
      const bucket = this.buckets.get(bucketId);
      if (!bucket || !types.includes(bucket.type) || list.length === 0) continue;
      if (oldest === null || list[0].timestamp < oldest) oldest = list[0].timestamp;
    }
    return oldest;
  }
}

export function eventFromJson(json) {
  return new AwEvent({
    id: json.id ?? null,
    timestamp: json.timestamp == null ? Date.now() * 1000 : parseIsoMicros(json.timestamp),
    duration: secondsToMicros(json.duration ?? 0),
    data: json.data ?? {},
  });
}

export function eventToJson(event) {
  return {
    id: event.id ?? null,
    timestamp: formatIso(event.timestamp),
    duration: event.duration / 1_000_000,
    data: toJsonValue(event.data),
  };
}

// JSON form of query results; events may also be nested inside event data.
export function toJsonValue(value) {
  if (value instanceof AwEvent) return eventToJson(value);
  if (value instanceof TimeDelta) return value.us / 1_000_000;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
  }
  return value;
}
