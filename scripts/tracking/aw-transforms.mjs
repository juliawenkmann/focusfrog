// Line-by-line port of ActivityWatch's aw_transform (aw-core) so FocusFrog
// computes exactly the same numbers as the ActivityWatch server it replaces.
// Events hold integer microseconds; like Python, timestamps are truncated to
// milliseconds whenever they are set, while durations keep microseconds.
import { secondsToMicros, truncateToMs } from './aw-time.mjs';

export class AwEvent {
  constructor({ id = null, timestamp, duration = 0, data = {} } = {}) {
    this.id = id;
    this.timestamp = timestamp;
    this.duration = duration;
    this.data = data || {};
  }

  get timestamp() {
    return this._timestamp;
  }

  set timestamp(us) {
    this._timestamp = truncateToMs(us);
  }

  get end() {
    return this._timestamp + this.duration;
  }
}

// A timedelta returned by a query function (serialized as float seconds).
export class TimeDelta {
  constructor(us) {
    this.us = us;
  }
}

export function cloneEvent(event) {
  return new AwEvent({
    id: event.id,
    timestamp: event.timestamp,
    duration: event.duration,
    data: structuredClone(event.data),
  });
}

// Python == for JSON-like values (dict order-insensitive, True == 1).
export function pyEquals(a, b) {
  if (a === b) return true;
  const scalar = value => typeof value === 'number' || typeof value === 'boolean';
  if (scalar(a) && scalar(b)) return Number(a) === Number(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => pyEquals(item, b[index]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(
      key => Object.prototype.hasOwnProperty.call(b, key) && pyEquals(a[key], b[key])
    );
  }
  return false;
}

function sortByTimestampStable(events) {
  return [...events].sort((a, b) => a.timestamp - b.timestamp);
}

// --- Timeslot (timeslot 0.1.2) -------------------------------------------

function contains(slot, other) {
  return slot.start <= other.start && other.end <= slot.end;
}

function overlaps(slot, other) {
  return (
    (slot.start <= other.start && other.start < slot.end) ||
    (slot.start < other.end && other.end <= slot.end) ||
    contains(other, slot)
  );
}

function intersection(slot, other) {
  if (contains(slot, other)) return other;
  if (slot.start <= other.start && other.start < slot.end)
    return { start: other.start, end: slot.end };
  if (slot.start < other.end && other.end <= slot.end) return { start: slot.start, end: other.end };
  if (contains(other, slot)) return slot;
  return null;
}

function gap(slot, other) {
  if (slot.end < other.start) return { start: slot.end, end: other.start };
  if (other.end < slot.start) return { start: other.end, end: slot.start };
  return null;
}

function eventPeriod(event) {
  return { start: event.timestamp, end: event.timestamp + event.duration };
}

function replaceEventPeriod(event, period) {
  const copy = cloneEvent(event);
  copy.timestamp = period.start;
  copy.duration = period.end - period.start;
  return copy;
}

// --- flood.py --------------------------------------------------------------

export function flood(events, pulsetime = 5) {
  const flooded = sortByTimestampStable(events.map(cloneEvent));
  const negativeGapTrimThreshold = secondsToMicros(0.1);
  const pulse = secondsToMicros(pulsetime);
  let warnedUnsafe = false;

  for (let index = 0; index < flooded.length - 1; index += 1) {
    const e1 = flooded[index];
    const e2 = flooded[index + 1];
    const gapUs = e2.timestamp - (e1.timestamp + e1.duration);
    if (!gapUs) continue;

    if (gapUs < 0 && pyEquals(e1.data, e2.data)) {
      const start = Math.min(e1.timestamp, e2.timestamp);
      const end = Math.max(e1.timestamp + e1.duration, e2.timestamp + e2.duration);
      e1.timestamp = start;
      e1.duration = end - start;
      e2.timestamp = end;
      e2.duration = 0;
    } else if (gapUs < -negativeGapTrimThreshold && !warnedUnsafe) {
      warnedUnsafe = true;
    } else if (-negativeGapTrimThreshold < gapUs && gapUs <= pulse) {
      const e2End = e2.timestamp + e2.duration;
      if (e1.duration >= e2.duration) {
        if (pyEquals(e1.data, e2.data)) {
          e1.duration = e2End - e1.timestamp;
          e2.timestamp = e2End;
          e2.duration = 0;
        } else {
          e1.duration = e2.timestamp - e1.timestamp;
        }
      } else if (pyEquals(e1.data, e2.data)) {
        e2.timestamp = e1.timestamp;
        e2.duration = e2End - e2.timestamp;
        e1.duration = 0;
      } else {
        e2.timestamp = e1.timestamp + e1.duration;
        e2.duration = e2End - e2.timestamp;
      }
    }
  }
  return flooded.filter(event => event.duration > 0);
}

// --- filter_period_intersect.py ---------------------------------------------

function* intersectingEventPairs(events1, events2) {
  let i1 = 0;
  let i2 = 0;
  while (i1 < events1.length && i2 < events2.length) {
    const e1 = events1[i1];
    const e2 = events2[i2];
    const p1 = eventPeriod(e1);
    const p2 = eventPeriod(e2);
    const ip = intersection(p1, p2);
    if (ip) {
      yield [e1, e2, ip];
      if (p1.end <= p2.end) i1 += 1;
      else i2 += 1;
    } else if (p1.end <= p2.start) {
      i1 += 1;
    } else if (p2.end <= p1.start) {
      i2 += 1;
    } else {
      i1 += 1;
      i2 += 1;
    }
  }
}

export function filterPeriodIntersect(events, filterEvents) {
  const sortedEvents = sortByTimestampStable(events);
  const sortedFilters = sortByTimestampStable(filterEvents);
  const result = [];
  for (const [e1, , ip] of intersectingEventPairs(sortedEvents, sortedFilters)) {
    result.push(replaceEventPeriod(e1, ip));
  }
  return result;
}

export function periodUnion(events1, events2) {
  const events = sortByTimestampStable([...events1, ...events2]);
  const merged = [];
  if (events.length) merged.push(events.shift());
  for (const event of events) {
    const last = merged[merged.length - 1];
    const eventSlot = eventPeriod(event);
    const lastSlot = eventPeriod(last);
    if (!gap(eventSlot, lastSlot)) {
      merged[merged.length - 1] = replaceEventPeriod(last, {
        start: Math.min(eventSlot.start, lastSlot.start),
        end: Math.max(eventSlot.end, lastSlot.end),
      });
    } else {
      merged.push(event);
    }
  }
  for (const event of merged) event.data = {};
  return merged;
}

// --- union_no_overlap.py -----------------------------------------------------

function splitEvent(event, at) {
  if (event.timestamp < at && at < event.timestamp + event.duration) {
    const first = cloneEvent(event);
    const second = cloneEvent(event);
    first.duration = at - event.timestamp;
    second.timestamp = at;
    second.duration = event.timestamp + event.duration - at;
    return [first, second];
  }
  return [event, null];
}

export function unionNoOverlap(events1In, events2In) {
  const events1 = events1In.map(cloneEvent);
  const events2 = events2In.map(cloneEvent);
  const union = [];
  let i1 = 0;
  let i2 = 0;
  while (i1 < events1.length && i2 < events2.length) {
    const e1 = events1[i1];
    const e2 = events2[i2];
    if (overlaps(eventPeriod(e1), eventPeriod(e2))) {
      if (e1.timestamp <= e2.timestamp) {
        union.push(e1);
        i1 += 1;
        const [, e2Next] = splitEvent(e2, e1.timestamp + e1.duration);
        if (e2Next) events2[i2] = e2Next;
        else i2 += 1;
      } else {
        const [e2Next, e2Next2] = splitEvent(e2, e1.timestamp);
        union.push(e2Next);
        i2 += 1;
        if (e2Next2) events2.splice(i2, 0, e2Next2);
      }
    } else if (e1.timestamp <= e2.timestamp) {
      union.push(e1);
      i1 += 1;
    } else {
      union.push(e2);
      i2 += 1;
    }
  }
  return [...union, ...events1.slice(i1), ...events2.slice(i2)];
}

// --- merge_events_by_keys.py ---------------------------------------------------

function hashableKey(values) {
  const normalize = value => {
    if (typeof value === 'boolean') return Number(value);
    if (Array.isArray(value)) return { tuple: value.map(normalize) };
    if (value && typeof value === 'object') throw new TypeError("unhashable type: 'dict'");
    return value;
  };
  return JSON.stringify(values.map(normalize));
}

export function mergeEventsByKeys(events, keys) {
  if (keys.length < 1) return events;
  const merged = new Map();
  for (const event of events) {
    const composite = [];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(event.data, key)) composite.push(event.data[key]);
    }
    const mapKey = hashableKey(composite);
    if (!merged.has(mapKey)) {
      const data = {};
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(event.data, key)) data[key] = event.data[key];
      }
      merged.set(
        mapKey,
        new AwEvent({ timestamp: event.timestamp, duration: event.duration, data })
      );
    } else {
      merged.get(mapKey).duration += event.duration;
    }
  }
  return [...merged.values()].map(
    event =>
      new AwEvent({
        id: null,
        timestamp: event.timestamp,
        duration: event.duration,
        data: event.data,
      })
  );
}

export function chunkEventsByKey(events, key, pulsetime = 5) {
  const chunked = [];
  const pulse = secondsToMicros(pulsetime);
  for (const event of events) {
    if (!Object.prototype.hasOwnProperty.call(event.data, key)) break;
    let timediff = secondsToMicros(999999999);
    if (chunked.length > 0) {
      // Upstream compares with the last *input* event, not the last chunk.
      const lastInput = events[events.length - 1];
      timediff = event.timestamp - (lastInput.timestamp + lastInput.duration);
    }
    const last = chunked[chunked.length - 1];
    if (last && pyEquals(last.data[key], event.data[key]) && timediff < pulse) {
      last.duration += event.duration;
      last.data.subevents.push(event);
    } else {
      chunked.push(
        new AwEvent({
          timestamp: event.timestamp,
          duration: event.duration,
          data: { [key]: event.data[key], subevents: [event] },
        })
      );
    }
  }
  return chunked;
}

// --- sort_by.py ----------------------------------------------------------------

export function sortByTimestamp(events) {
  return sortByTimestampStable(events);
}

export function sortByDuration(events) {
  return [...events].sort((a, b) => b.duration - a.duration);
}

export function limitEvents(events, count) {
  return events.slice(0, count);
}

export function sumDurations(events) {
  let seconds = 0;
  for (const event of events) seconds += event.duration / 1_000_000;
  return new TimeDelta(secondsToMicros(seconds));
}

export function concat(events1, events2) {
  return [...events1, ...events2];
}

// --- Python regex compatibility ------------------------------------------------

const WORD = '\\p{L}\\p{N}_';

// Translates the Python `re` syntax ActivityWatch rules use into an equivalent
// Unicode-aware JavaScript RegExp (Python str patterns are Unicode by default).
export function compilePythonRegex(pattern, { ignoreCase = false } = {}) {
  let source = String(pattern);
  let flags = 'u';
  if (ignoreCase) flags += 'i';
  const inline = /^\(\?([aiLmsux]+)\)/.exec(source);
  if (inline) {
    source = source.slice(inline[0].length);
    for (const flag of inline[1]) {
      if ((flag === 'i' || flag === 'm' || flag === 's') && !flags.includes(flag)) flags += flag;
    }
  }

  let out = '';
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      const next = source[index + 1];
      index += 1;
      if (next === undefined) throw new SyntaxError('bad escape (end of pattern)');
      if (next === 'w') out += inClass ? WORD : `[${WORD}]`;
      else if (next === 'W') out += inClass ? '\\P{L}\\P{N}' : `[^${WORD}]`;
      else if (next === 'd') out += '\\p{Nd}';
      else if (next === 'D') out += '\\P{Nd}';
      else if (next === 'b' && !inClass)
        out += `(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`;
      else if (next === 'B' && !inClass)
        out += `(?:(?<=[${WORD}])(?=[${WORD}])|(?<![${WORD}])(?![${WORD}]))`;
      else if (next === 'A' && !inClass) out += '^';
      else if (next === 'Z' && !inClass) out += '$';
      else if (/[A-Za-z0-9]/.test(next)) out += `\\${next}`;
      else if ('^$\\.*+?()[]{}|/'.includes(next)) out += `\\${next}`;
      // Unicode-mode JS only accepts \- inside a character class.
      else if (next === '-') out += inClass ? '\\-' : '-';
      else out += next;
    } else if (char === '[' && !inClass) {
      inClass = true;
      out += char;
      if (source[index + 1] === '^') {
        out += '^';
        index += 1;
      }
      if (source[index + 1] === ']') {
        out += '\\]';
        index += 1;
      }
    } else if (char === ']' && inClass) {
      inClass = false;
      out += char;
    } else if (!inClass && source.startsWith('(?P<', index)) {
      out += '(?<';
      index += 3;
    } else if (!inClass && source.startsWith('(?P=', index)) {
      const close = source.indexOf(')', index);
      out += `\\k<${source.slice(index + 4, close)}>`;
      index = close;
    } else {
      out += char;
    }
  }
  return new RegExp(out, flags);
}

// --- classify.py -------------------------------------------------------------------

export class Rule {
  constructor(rule = {}) {
    this.selectKeys = rule.select_keys ?? null;
    this.ignoreCase = Boolean(rule.ignore_case ?? false);
    const regex = rule.regex ?? null;
    this.regex = regex ? compilePythonRegex(regex, { ignoreCase: this.ignoreCase }) : null;
  }

  match(event) {
    const values =
      this.selectKeys && this.selectKeys.length
        ? this.selectKeys.map(key => event.data[key] ?? null)
        : Object.values(event.data);
    if (this.regex) {
      for (const value of values) {
        if (typeof value === 'string' && this.regex.test(value)) return true;
      }
    }
    return false;
  }
}

function pickDeepest(categories) {
  return categories.reduce((t1, t2) => (t2.length >= t1.length ? t2 : t1), ['Uncategorized']);
}

export function categorize(events, classes) {
  for (const event of events) {
    event.data.$category = pickDeepest(
      classes.filter(([, rule]) => rule.match(event)).map(([category]) => category)
    );
  }
  return [...events];
}

export function tag(events, classes) {
  for (const event of events) {
    event.data.$tags = classes.filter(([, rule]) => rule.match(event)).map(([name]) => name);
  }
  return [...events];
}

// --- filter_keyvals.py --------------------------------------------------------------

export function filterKeyvals(events, key, vals, exclude = false) {
  const predicate = event =>
    Object.prototype.hasOwnProperty.call(event.data, key) &&
    vals.some(value => pyEquals(event.data[key], value));
  return events.filter(event => (exclude ? !predicate(event) : predicate(event)));
}

export function filterKeyvalsRegex(events, key, regex) {
  const compiled = compilePythonRegex(regex);
  return events.filter(event => {
    if (!Object.prototype.hasOwnProperty.call(event.data, key)) return false;
    const value = event.data[key];
    if (typeof value !== 'string') throw new TypeError('expected string or bytes-like object');
    return compiled.test(value);
  });
}

// --- split_url_events.py (urllib.parse.urlparse) ---------------------------------------

const USES_PARAMS = new Set([
  '',
  'ftp',
  'hdl',
  'prospero',
  'http',
  'imap',
  'https',
  'shttp',
  'rtsp',
  'rtsps',
  'rtspu',
  'sip',
  'sips',
  'mms',
  'sftp',
  'tel',
]);

export function urlparse(input) {
  // Strip leading C0 controls and spaces, then embedded tabs/newlines (urlsplit).
  let url = String(input);
  let leading = 0;
  while (leading < url.length && url.charCodeAt(leading) <= 0x20) leading += 1;
  url = url.slice(leading).replace(/[\t\r\n]/g, '');
  let scheme = '';
  let netloc = '';
  let query = '';
  let fragment = '';
  const colon = url.indexOf(':');
  if (colon > 0 && /^[A-Za-z]$/.test(url[0]) && /^[A-Za-z0-9+\-.]+$/.test(url.slice(0, colon))) {
    scheme = url.slice(0, colon).toLowerCase();
    url = url.slice(colon + 1);
  }
  if (url.startsWith('//')) {
    let delim = url.length;
    for (const char of '/?#') {
      const found = url.indexOf(char, 2);
      if (found >= 0) delim = Math.min(delim, found);
    }
    netloc = url.slice(2, delim);
    url = url.slice(delim);
  }
  const hash = url.indexOf('#');
  if (hash >= 0) {
    fragment = url.slice(hash + 1);
    url = url.slice(0, hash);
  }
  const question = url.indexOf('?');
  if (question >= 0) {
    query = url.slice(question + 1);
    url = url.slice(0, question);
  }
  let params = '';
  if (USES_PARAMS.has(scheme) && url.includes(';')) {
    const semicolon = url.includes('/') ? url.indexOf(';', url.lastIndexOf('/')) : url.indexOf(';');
    if (semicolon >= 0) {
      params = url.slice(semicolon + 1);
      url = url.slice(0, semicolon);
    }
  }
  return { scheme, netloc, path: url, params, query, fragment };
}

export function splitUrlEvents(events) {
  for (const event of events) {
    if (!Object.prototype.hasOwnProperty.call(event.data, 'url')) continue;
    const parsed = urlparse(event.data.url);
    event.data.$protocol = parsed.scheme;
    let domain = '';
    if (parsed.netloc)
      domain = parsed.netloc.startsWith('www.') ? parsed.netloc.slice(4) : parsed.netloc;
    else if (parsed.scheme) domain = parsed.scheme;
    event.data.$domain = domain;
    event.data.$path = parsed.path;
    event.data.$params = parsed.params;
    event.data.$options = parsed.query;
    event.data.$identifier = parsed.fragment;
  }
  return events;
}

export function simplifyString(events, key = 'title') {
  const copies = events.map(cloneEvent);
  for (const event of copies) {
    event.data[key] = String(event.data[key]).replace(/^\([0-9]+\)\s*/u, '');
    if (key === 'title' && Object.prototype.hasOwnProperty.call(event.data, 'app')) {
      event.data[key] = event.data[key].replace(/FPS:\s+[0-9.]+/gu, 'FPS: ...');
      event.data[key] = event.data[key].replace(/^(●|\*)\s*/u, '');
    }
  }
  return copies;
}

// --- heartbeats.py -------------------------------------------------------------------

export function heartbeatMerge(lastEvent, heartbeat, pulsetime) {
  if (pyEquals(lastEvent.data, heartbeat.data)) {
    const pulsePeriodEnd = lastEvent.timestamp + lastEvent.duration + secondsToMicros(pulsetime);
    const withinWindow =
      lastEvent.timestamp <= heartbeat.timestamp && heartbeat.timestamp <= pulsePeriodEnd;
    if (withinWindow) {
      const newDuration = heartbeat.timestamp - lastEvent.timestamp + heartbeat.duration;
      if (lastEvent.duration >= 0) {
        lastEvent.duration = Math.max(lastEvent.duration, newDuration);
        return lastEvent;
      }
    }
  }
  return null;
}
